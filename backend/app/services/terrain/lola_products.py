"""DEM LOLA polari sud della PDS e loro copertura.

Valori letti dalle etichette PDS (.lbl) dei file in
https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/
(verificati il 14/11/2026). Tutti sono in stereografica polare sud, sfera di 1737.4 km, come le
regioni Artemis III. Ogni file copre un quadrato centrato sul polo:
metà lato = LINE_SAMPLES × MAP_SCALE / 2.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class LolaProduct:
    name: str
    scale_m: float
    samples: int

    @property
    def half_width_m(self) -> float:
        return self.samples * self.scale_m / 2


# Dal più fine al più grossolano.
SOUTH_POLE_PRODUCTS: tuple[LolaProduct, ...] = (
    LolaProduct("ldem_875s_5m", 5, 30336),  # ±75.84 km, fino a 87.5°S
    LolaProduct("ldem_85s_10m", 10, 30336),  # ±151.68 km, fino a 85°S
    LolaProduct("ldem_80s_20m", 20, 30400),  # ±304 km, fino a 80°S
    LolaProduct("ldem_75s_30m", 30, 30496),  # ±457.44 km, fino a 75°S
    LolaProduct("ldem_75s_240m", 240, 3812),  # ±457.44 km: orizzonte lontano
)


def covering_products(xmin: float, ymin: float, xmax: float, ymax: float) -> list[str]:
    """Nomi dei DEM che coprono per intero il rettangolo (metri stereografici), dal più fine."""
    reach = max(abs(xmin), abs(ymin), abs(xmax), abs(ymax))
    return [p.name for p in SOUTH_POLE_PRODUCTS if reach <= p.half_width_m]
