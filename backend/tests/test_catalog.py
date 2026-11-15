import pytest

from app.services.regions.catalog import CatalogError, load_catalog

HEADER = """
[sector]
name = "Polo sud"
lat_limit = -84.0

[grid]
cell_size_m = 100
"""

REGION = """
[[region]]
id = "malapert-massif"
name = "Malapert Massif"
moontrek_label = "Malapert Massif"
lists = ["2022", "2024"]
active = true
"""

SITE = """
[[site]]
id = "prova"
name = "Sito di prova"
lat = -85.0
lon = 10.0
kind = "previsto"
source = "https://example.test/fonte"
"""


def _write(tmp_path, regions: str, sites: str = ""):
    (tmp_path / "regions.toml").write_text(HEADER + regions, encoding="utf-8")
    (tmp_path / "sites.toml").write_text(sites, encoding="utf-8")
    return tmp_path


def test_real_catalog(catalog):
    assert catalog.sector.lat_limit == -84.0
    assert catalog.cell_size_m == 100
    assert len(catalog.regions) == 13  # solo regioni con contorno pubblicato
    assert {r.id for r in catalog.regions if r.active} == {"de-gerlache-rim-2", "malapert-massif"}
    assert {r.id for r in catalog.regions if "2024" in r.lists} == {
        "de-gerlache-rim-2",
        "haworth",
        "malapert-massif",
        "nobile-rim-1",
        "nobile-rim-2",
    }
    kinds = [s.kind for s in catalog.sites]
    assert (kinds.count("atterrato"), kinds.count("previsto")) == (5, 4)
    assert all(s.date for s in catalog.sites if s.kind == "atterrato")
    in_sector = {s.id for s in catalog.sites if s.in_sector}
    assert in_sector == {"griffin-1", "blue-moon-mk1-pathfinder"}


def test_valid_site(tmp_path):
    catalog = load_catalog(_write(tmp_path, REGION, SITE))
    assert catalog.sites[0].source == "https://example.test/fonte"
    assert catalog.sites[0].in_sector
    assert catalog.sites[0].date is None


def test_site_outside_sector_is_accepted(tmp_path):
    apollo = SITE.replace("lat = -85.0", "lat = 0.67416") + 'date = "1969-07-20"\n'
    site = load_catalog(_write(tmp_path, REGION, apollo)).sites[0]
    assert not site.in_sector
    assert site.date == "1969-07-20"


@pytest.mark.parametrize(
    "regions,sites,message",
    [
        (REGION.replace('moontrek_label = "Malapert Massif"\n', ""), "", "moontrek_label"),
        (REGION + REGION, "", "ripetuto"),
        (REGION.replace('"2022", "2024"', '"2023"'), "", "lists"),
        (REGION.replace("malapert-massif", "Malapert Massif", 1), "", "non valido"),
        (REGION, SITE.replace('source = "https://example.test/fonte"', ""), "fonte"),
        (REGION, SITE.replace("lat = -85.0", "lat = -95.0"), "fuori intervallo"),
        (REGION, SITE + 'date = "20/07/1969"\n', "AAAA-MM-GG"),
        (REGION, SITE.replace('"previsto"', '"ipotetico"'), "kind"),
    ],
)
def test_catalog_errors(tmp_path, regions, sites, message):
    with pytest.raises(CatalogError, match=message):
        load_catalog(_write(tmp_path, regions, sites))
