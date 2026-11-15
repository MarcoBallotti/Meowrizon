"""Quote numeriche LOLA dagli ImageServer di NASA Moon Trek.

I ritagli sono tasselli allineati alla griglia nativa del prodotto, chiesti con
`RSP_NearestNeighbor` e tanti pixel quanti quelli nativi: nessun ricampionamento. Ogni
tassello è una richiesta fissa, quindi la cache di `Collector` lo riusa tra punti e date.
"""

import math
from dataclasses import dataclass

import numpy as np

from app.core.moon import MOON_RADIUS_M

TILE_PX = 1500
_MAX_ABS_HEIGHT_M = 20_000.0


class TerrainError(ValueError):
    """Il terreno richiesto non è disponibile o non è coerente con i metadati attesi."""


@dataclass(frozen=True)
class DemProduct:
    label: str
    server: str  # sottocartella ArcGIS di Moon Trek: trekarcgis oppure trekarcgis2
    pixel_m: float
    xmin: float
    ymin: float
    xmax: float
    ymax: float
    family: str
    origin: str
    pixel_type: str = "F32"

    @property
    def width(self) -> int:
        return round((self.xmax - self.xmin) / self.pixel_m)

    @property
    def height(self) -> int:
        return round((self.ymax - self.ymin) / self.pixel_m)


_GDR = "LRO LOLA GDR v04 (NASA PDS), stereografica polare sud, sfera 1737400 m"
PRODUCTS: dict[str, DemProduct] = {
    p.label: p
    for p in (
        DemProduct(
            "LRO_LOLA_DEM_SPole875_5mp_v04", "trekarcgis", 5.0,
            -75840.0, -75840.0, 75840.0, 75840.0, "lola-gdr-v04", _GDR,
        ),
        DemProduct(
            "LRO_LOLA_DEM_SPole75_30mp_v04", "trekarcgis", 30.0,
            -457440.0, -457440.0, 457440.0, 457440.0, "lola-gdr-v04", _GDR,
        ),
        DemProduct(
            "LRO_LOLA_DEM_SPole45_100mp_v04", "trekarcgis", 100.0,
            -1440000.0, -1440000.0, 1440000.0, 1440000.0, "lola-gdr-v04", _GDR,
        ),
        DemProduct(
            "Site23_final_adj_5mpp_surf", "trekarcgis2", 5.0,
            -11000.0, 111000.0, 10000.0, 132000.0, "pgda-site-dem",
            "LRO LOLA DEM 5 m/px del sito 23 Malapert Massif (NASA GSFC PGDA, prodotto 78), "
            "distribuito da Moon Trek",
        ),
        DemProduct(
            "LRO_LOLA_Count_SPole875_5mp_v04", "trekarcgis", 5.0,
            -75840.0, -75840.0, 75840.0, 75840.0, "lola-count",
            "Numero di spot LOLA per pixel del DEM polare a 5 m v04; 0 = pixel interpolato",
            "S16",
        ),
    )
}  # fmt: skip

# Prodotto dei conteggi LOLA associato a un DEM, quando Moon Trek lo distribuisce.
COUNT_PRODUCTS = {"LRO_LOLA_DEM_SPole875_5mp_v04": "LRO_LOLA_Count_SPole875_5mp_v04"}


def service_url(base_url: str, product: DemProduct) -> str:
    return f"{base_url.rstrip('/')}/{product.server}/rest/services/{product.label}/ImageServer"


def metadata_entry(base_url: str, product: DemProduct) -> dict:
    return {
        "name": f"engine-dem-meta-{product.label.lower()}"[:80],
        "provider": "moon_trek",
        "format": "json",
        "url": service_url(base_url, product),
        "params": {"f": "json"},
    }


def check_metadata(product: DemProduct, meta: dict) -> dict:
    """Confronta il registro locale con i metadati del servizio effettivamente interrogato."""
    extent = meta.get("extent") or {}
    wkt = str((extent.get("spatialReference") or {}).get("wkt", ""))
    problems = []
    for key in ("xmin", "ymin", "xmax", "ymax"):
        value = extent.get(key)
        if value is None or abs(float(value) - getattr(product, key)) > product.pixel_m / 2:
            problems.append(f"{key}={value}")
    for key in ("pixelSizeX", "pixelSizeY"):
        value = meta.get(key)
        if value is None or abs(float(value) - product.pixel_m) > 1e-6:
            problems.append(f"{key}={value}")
    if meta.get("pixelType") != product.pixel_type or meta.get("bandCount") != 1:
        problems.append(f"pixelType={meta.get('pixelType')}, bande={meta.get('bandCount')}")
    if "Stereographic_South_Pole" not in wkt or "1737400" not in wkt:
        problems.append("sistema di riferimento diverso dalla stereografica polare sud lunare")
    if problems:
        raise TerrainError(f"{product.label}: metadati inattesi ({'; '.join(problems)})")
    return {
        "product": product.label,
        "pixel_m": product.pixel_m,
        "extent_m": [product.xmin, product.ymin, product.xmax, product.ymax],
        "pixel_type": meta.get("pixelType"),
        "wkt": wkt,
        "min_values": meta.get("minValues"),
        "max_values": meta.get("maxValues"),
        "no_data_value": meta.get("noDataValue"),
        "max_image_height": meta.get("maxImageHeight"),
        "max_image_width": meta.get("maxImageWidth"),
        "vertical_reference": f"metri rispetto alla sfera di {MOON_RADIUS_M:.0f} m",
        "family": product.family,
        "origin": product.origin,
    }


def tile_bounds(product: DemProduct, i: int, j: int) -> tuple[int, int, int, int]:
    """Colonna e riga iniziali (dall'angolo in alto a sinistra) e dimensioni del tassello."""
    col0, row0 = i * TILE_PX, j * TILE_PX
    if not (0 <= col0 < product.width and 0 <= row0 < product.height):
        raise TerrainError(f"{product.label}: tassello {i},{j} fuori dal prodotto")
    return col0, row0, min(TILE_PX, product.width - col0), min(TILE_PX, product.height - row0)


def tile_entry(base_url: str, product: DemProduct, i: int, j: int) -> dict:
    col0, row0, width, height = tile_bounds(product, i, j)
    x0 = product.xmin + col0 * product.pixel_m
    y1 = product.ymax - row0 * product.pixel_m
    x1 = x0 + width * product.pixel_m
    y0 = y1 - height * product.pixel_m
    return {
        "name": f"engine-dem-{product.label.lower()}"[:80],
        "provider": "moon_trek",
        "format": "tiff",
        "url": service_url(base_url, product) + "/exportImage",
        "params": {
            "bbox": f"{x0:.3f},{y0:.3f},{x1:.3f},{y1:.3f}",
            "size": f"{width},{height}",
            "format": "tiff",
            "pixelType": product.pixel_type,
            "interpolation": "RSP_NearestNeighbor",
            "f": "image",
        },
        "tile": [i, j],
        "max_mb": 64,
    }


def window_pixels(product: DemProduct, bbox: tuple[float, float, float, float]):
    """Finestra in pixel (col0, row0, col1, row1) che copre il rettangolo, ritagliata al prodotto.

    Restituisce None se il rettangolo non interseca il prodotto.
    """
    xmin, ymin, xmax, ymax = bbox
    col0 = max(0, math.floor((xmin - product.xmin) / product.pixel_m))
    col1 = min(product.width, math.ceil((xmax - product.xmin) / product.pixel_m))
    row0 = max(0, math.floor((product.ymax - ymax) / product.pixel_m))
    row1 = min(product.height, math.ceil((product.ymax - ymin) / product.pixel_m))
    if col1 <= col0 or row1 <= row0:
        return None
    return col0, row0, col1, row1


def read_tile(path, product: DemProduct, i: int, j: int) -> np.ndarray:
    """Legge un tassello GeoTIFF e verifica che sia sulla griglia nativa richiesta."""
    import rasterio

    col0, row0, width, height = tile_bounds(product, i, j)
    x0 = product.xmin + col0 * product.pixel_m
    y1 = product.ymax - row0 * product.pixel_m
    with rasterio.open(path) as source:
        if source.count != 1 or (source.width, source.height) != (width, height):
            raise TerrainError(
                f"{product.label} {i},{j}: dimensioni {source.width}x{source.height} "
                f"invece di {width}x{height}"
            )
        t = source.transform
        tolerance = product.pixel_m * 1e-3
        if (
            abs(t.a - product.pixel_m) > 1e-6
            or abs(t.e + product.pixel_m) > 1e-6
            or abs(t.b) > 1e-9
            or abs(t.d) > 1e-9
            or abs(t.c - x0) > tolerance
            or abs(t.f - y1) > tolerance
        ):
            raise TerrainError(f"{product.label} {i},{j}: georeferenziazione inattesa ({t})")
        if source.crs is not None:
            parameters = source.crs.to_dict()
            radius = parameters.get("R", parameters.get("a"))
            if radius is not None and abs(float(radius) - MOON_RADIUS_M) > 0.5:
                raise TerrainError(f"{product.label} {i},{j}: raggio di riferimento {radius}")
        band = source.read(1, masked=True)
    values = np.asarray(band.filled(np.nan), dtype=np.float32)
    with np.errstate(invalid="ignore"):
        values[~np.isfinite(values) | (np.abs(values) > _MAX_ABS_HEIGHT_M)] = np.nan
    return values


class Raster:
    """Griglia di quote in metri: `values[riga, colonna]`, origine in alto a sinistra."""

    def __init__(self, values: np.ndarray, x0: float, y1: float, pixel_m: float, label: str):
        self.values = values
        self.x0 = float(x0)
        self.y1 = float(y1)
        self.pixel_m = float(pixel_m)
        self.label = label

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        rows, cols = self.values.shape
        return (
            self.x0,
            self.y1 - rows * self.pixel_m,
            self.x0 + cols * self.pixel_m,
            self.y1,
        )

    def sample(self, x, y) -> np.ndarray:
        """Interpolazione bilineare fra i centri dei pixel. NaN fuori copertura o su NoData."""
        x = np.asarray(x, dtype=float)
        y = np.asarray(y, dtype=float)
        rows, cols = self.values.shape
        fc = (x - self.x0) / self.pixel_m - 0.5
        fr = (self.y1 - y) / self.pixel_m - 0.5
        with np.errstate(invalid="ignore"):
            inside = (fc >= 0) & (fc <= cols - 1) & (fr >= 0) & (fr <= rows - 1)
        c0 = np.clip(np.floor(np.where(inside, fc, 0)).astype(np.int64), 0, max(cols - 2, 0))
        r0 = np.clip(np.floor(np.where(inside, fr, 0)).astype(np.int64), 0, max(rows - 2, 0))
        c1 = np.minimum(c0 + 1, cols - 1)
        r1 = np.minimum(r0 + 1, rows - 1)
        wc = np.where(inside, fc - c0, 0.0)
        wr = np.where(inside, fr - r0, 0.0)
        v = self.values
        out = (
            v[r0, c0] * (1 - wc) * (1 - wr)
            + v[r0, c1] * wc * (1 - wr)
            + v[r1, c0] * (1 - wc) * wr
            + v[r1, c1] * wc * wr
        )
        return np.where(inside, out, np.nan)


class TerrainStack:
    """Più griglie dalla più fine alla più grossolana: si usa la più fine che copre il punto."""

    def __init__(self, rasters: list[Raster]):
        if not rasters:
            raise TerrainError("Nessuna griglia di terreno")
        self.rasters = rasters

    def sample(self, x, y, start: int = 0) -> np.ndarray:
        x, y = np.broadcast_arrays(np.asarray(x, dtype=float), np.asarray(y, dtype=float))
        shape = x.shape
        x, y = x.ravel(), y.ravel()
        out = np.full(x.size, np.nan)
        for raster in self.rasters[start:]:
            todo = np.isnan(out)
            if not todo.any():
                break
            out[todo] = raster.sample(x[todo], y[todo])
        return out.reshape(shape)


def load_window(product: DemProduct, bbox, get_tile) -> tuple[Raster, list[dict]]:
    """Monta i tasselli che coprono `bbox`. `get_tile(i, j)` restituisce (array, record)."""
    window = window_pixels(product, bbox)
    if window is None:
        raise TerrainError(f"{product.label} non copre l'area richiesta {bbox}")
    col0, row0, col1, row1 = window
    values = np.full((row1 - row0, col1 - col0), np.nan, dtype=np.float32)
    records = []
    for j in range(row0 // TILE_PX, (row1 - 1) // TILE_PX + 1):
        for i in range(col0 // TILE_PX, (col1 - 1) // TILE_PX + 1):
            tile, record = get_tile(i, j)
            records.append(record)
            tc0, tr0, width, height = tile_bounds(product, i, j)
            a0, a1 = max(col0, tc0), min(col1, tc0 + width)
            b0, b1 = max(row0, tr0), min(row1, tr0 + height)
            values[b0 - row0 : b1 - row0, a0 - col0 : a1 - col0] = tile[
                b0 - tr0 : b1 - tr0, a0 - tc0 : a1 - tc0
            ]
    raster = Raster(
        values,
        product.xmin + col0 * product.pixel_m,
        product.ymax - row0 * product.pixel_m,
        product.pixel_m,
        product.label,
    )
    return raster, records
