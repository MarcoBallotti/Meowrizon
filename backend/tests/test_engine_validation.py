"""Strumenti di validazione: lettura dell'ortofoto PDS, soglia, trasporto della direzione solare."""

from pathlib import Path

import numpy as np
import pytest
from support import temporary_directory

from app.core.moon import lonlat_to_stereo
from app.services.engine import lroc_check
from app.services.engine.validation import _check
from app.services.normalization import utc_ms

LABEL = """PDS_VERSION_ID            = PDS3
RECORD_TYPE   = FIXED_LENGTH
RECORD_BYTES  = 600
FILE_RECORDS  = 6
LABEL_RECORDS = 3
^IMAGE        = 4
PRODUCT_ID                = NAC_DTM_TEST_M123_4M
PRODUCT_VERSION_ID        = "v1.9"
START_TIME                   = 2010-09-23T18:32:31
STOP_TIME                    = 2010-09-23T18:33:07
OBJECT = IMAGE_MAP_PROJECTION
    MAP_PROJECTION_TYPE          = "POLAR STEREOGRAPHIC"
    A_AXIS_RADIUS                = 1737.4 <KM>
    CENTER_LATITUDE              = -90.0 <DEG>
    CENTER_LONGITUDE             = 0.0 <DEG>
    MAP_SCALE                    = 4.0 <METERS/PIXEL>
    MAXIMUM_LATITUDE             = -84.85 <DEG>
    MINIMUM_LATITUDE             = -86.00 <DEG>
    LINE_PROJECTION_OFFSET       = 38986.0
    SAMPLE_PROJECTION_OFFSET     = 1154.0
END_OBJECT = IMAGE_MAP_PROJECTION
OBJECT = IMAGE
    LINES                      = 3
    LINE_SAMPLES               = 300
    SAMPLE_TYPE                = LSB_UNSIGNED_INTEGER
    SAMPLE_BITS                = 16
    SCALING_FACTOR             = 0.00002
    OFFSET                     = -0.0002
    CORE_NULL                  = 0
END_OBJECT = IMAGE
END
"""


def write_image(folder: Path, label: str = LABEL) -> Path:
    data = np.full((3, 300), 1010, dtype="<u2")
    data[0, 0] = 0  # NULL
    data[0, 1] = 65535  # saturazione
    data[2, 299] = 5010
    path = folder / "ortho.IMG"
    path.write_bytes(label.encode("latin-1").ljust(1800, b" ") + data.tobytes())
    return path


def test_pds_ortho_is_read_with_units_time_and_georeference():
    with temporary_directory() as folder:
        image = lroc_check.read_ortho(write_image(Path(folder)))
    assert image["product_id"] == "NAC_DTM_TEST_M123_4M" and image["scale_m"] == 4.0
    assert image["start_ms"] == utc_ms("2010-09-23T18:32:31Z")
    assert image["stop_ms"] == utc_ms("2010-09-23T18:33:07Z")
    reflectance = image["reflectance"]
    assert reflectance.shape == (3, 300)
    assert np.isnan(reflectance[0, 0]) and np.isnan(reflectance[0, 1])  # non sono ombra
    assert reflectance[1, 5] == pytest.approx(1010 * 0.00002 - 0.0002)
    assert reflectance[2, 299] == pytest.approx(5010 * 0.00002 - 0.0002)
    # Il polo (origine della proiezione) è a 1154 colonne e 38986 righe dal primo pixel.
    x, y = lroc_check.pixel_xy(image, 0, 0)
    assert (x, y) == (-1154 * 4.0, 38986 * 4.0)
    x, y = lroc_check.pixel_xy(image, 38986, 1154)
    assert (x, y) == (0.0, 0.0)
    x, y = lroc_check.pixel_xy(image, 2700, 1317)
    assert x == pytest.approx(652.0) and y == pytest.approx(145144.0)


@pytest.mark.parametrize(
    "old, new",
    [
        ('"POLAR STEREOGRAPHIC"', '"EQUIRECTANGULAR"'),
        ("CENTER_LONGITUDE             = 0.0", "CENTER_LONGITUDE             = 90.0"),
        ("A_AXIS_RADIUS                = 1737.4", "A_AXIS_RADIUS                = 1738.0"),
        ("SAMPLE_BITS                = 16", "SAMPLE_BITS                = 8"),
        ("START_TIME                   = 2010-09-23T18:32:31\n", ""),
    ],
)
def test_unexpected_ortho_labels_are_rejected(old, new):
    assert old in LABEL
    with temporary_directory() as folder:
        with pytest.raises(ValueError):
            lroc_check.read_ortho(write_image(Path(folder), LABEL.replace(old, new)))


def test_otsu_threshold_separates_two_populations_without_using_the_prediction():
    random = np.random.default_rng(7)
    dark = random.normal(-3.0, 0.15, 4000)
    bright = random.normal(-1.5, 0.15, 6000)
    threshold = lroc_check.otsu_threshold(np.concatenate([dark, bright]))
    assert -2.7 < threshold < -1.8


def test_sun_direction_is_carried_between_sites_as_a_moon_fixed_vector():
    lat, lon = -85.9, 359.0
    fixed = lroc_check.to_moon_fixed(lat, lon, 123.4, 2.5)
    assert np.linalg.norm(fixed) == pytest.approx(1.0)
    azimuth, elevation = lroc_check.from_moon_fixed(fixed, lat, lon)
    assert azimuth == pytest.approx(123.4) and elevation == pytest.approx(2.5)
    # Spostandosi di 2° in longitudine vicino al polo il nord locale ruota di circa 2°.
    other_az, other_el = lroc_check.from_moon_fixed(fixed, lat, lon + 2.0)
    assert (azimuth - other_az) == pytest.approx(2.0 * np.sin(np.radians(85.9)), abs=0.02)
    assert abs(other_el - elevation) < 0.2
    # Un corpo allo zenit di un sito è sull'orizzontale a 90° di distanza sulla sfera.
    zenith = lroc_check.to_moon_fixed(0.0, 0.0, 0.0, 90.0)
    assert lroc_check.from_moon_fixed(zenith, 0.0, 90.0)[1] == pytest.approx(0.0, abs=1e-9)
    x, y = lonlat_to_stereo(lon, lat)
    assert y > 0 and x < 0  # longitudine 359°: appena a ovest del meridiano centrale


def test_check_records_failures_without_changing_the_tolerance():
    assert _check("a", 0.5, 1.0, "deg") == {
        "metric": "a", "value": 0.5, "tolerance": 1.0, "unit": "deg", "pass": True,
    }  # fmt: skip
    assert _check("a", 1.5, 1.0, "deg")["pass"] is False
    assert _check("a", 0.95, 0.9, "fraction", higher_is_better=True)["pass"] is True
    missing = _check("a", None, 1.0, "deg")
    assert missing["pass"] is None and missing["value"] is None
    assert _check("a", float("nan"), 1.0, "deg")["pass"] is None


def test_slope_matrix_retains_absent_classes_unknowns_and_boundary_errors():
    from app.services.engine.validation import slope_classification

    result = slope_classification(
        np.array([0.0, 5.0, 10.0, 15.0, 9.99, np.nan]),
        np.array([0.0, 5.0, 15.0, 4.0, 10.01, 0.0]),
    )
    assert result["valid"] == 5 and result["requested"] == 6
    assert result["matrix"] == [[1, 0, 0, 0], [0, 1, 1, 0], [0, 0, 0, 1], [1, 0, 0, 0]]
    assert result["adjacent_errors"] == 2 and result["nonadjacent_errors"] == 1
    assert result["agreement"] == 0.4
    assert result["discordances"][-1]["reference_distance_to_boundary_deg"] == pytest.approx(0.01)
    empty = slope_classification(np.array([np.nan]), np.array([0.0]))
    assert empty["agreement"] is None
    assert empty["absent_reference_classes"] == [0, 1, 2, 3]


def test_unexecuted_or_failed_gates_cannot_report_full_validation():
    from app.services.engine.validation_metrics import validation_status

    assert validation_status({})["status"] == "incomplete"
    evidence = {
        g: [{"checks": [{"pass": True}]}]
        for g in ("interpolation", "slope", "horizon", "scenarios")
    }
    evidence.update(
        alignment=[{"pass": True}], eclipse=[{"consistent": True}], lroc=[{"pass": True}]
    )
    assert validation_status(evidence)["status"] == "passed"
    evidence["eclipse"][0]["consistent"] = False
    assert validation_status(evidence)["gates"]["eclipse"] == "failed"
    evidence["lroc"] = []
    assert validation_status(evidence)["gates"]["lroc"] == "incomplete"


def test_binary_metrics_do_not_hide_missing_shadow_class_or_unknowns():
    from app.services.engine.validation_metrics import binary_metrics

    m = binary_metrics([0, 0, 1, 1, -1], [0, 1, 1, -1, 0])
    assert m["matrix"] == [[1, 1], [0, 1]]
    assert m["excluded"] == 2 and m["balanced_accuracy"] == 0.75
    assert binary_metrics([1, 1], [1, 1])["balanced_accuracy"] is None
    assert binary_metrics([-1], [0])["accuracy"] is None


def test_evidence_is_not_overwritten(tmp_path):
    from app.services.engine.orchestrator import EnginePaths
    from app.services.engine.validation import write_evidence

    paths = EnginePaths(root=tmp_path, lock=tmp_path / "lock")
    one = write_evidence({"run": 1}, paths)
    two = write_evidence({"run": 2}, paths)
    assert one != two
    with pytest.raises(FileExistsError):
        write_evidence({"run": 3}, paths, one.name)


def test_event_comparison_rejects_same_count_with_different_boundary_topology():
    from types import SimpleNamespace

    from app.services.engine.validation import _event_shift

    def scenario(start, end):
        interval = SimpleNamespace(
            start_kind=start,
            end_kind=end,
            start_utc="2026-12-01T00:00:00Z",
            end_utc="2026-12-01T01:00:00Z",
        )
        return SimpleNamespace(
            windows=SimpleNamespace(sun_c3=[interval], earth_c3=[], joint_c3=[], dark=[])
        )

    a = scenario("request_start", "observed_transition")
    b = scenario("observed_transition", "request_end")
    assert _event_shift(a, b)["count_match"] is False
