# Contratto API frontend — riferimento unico

La specifica v1 del 14 novembre è superata dalla ricognizione del **15 novembre 2026** delle nuove schermate, dei mock e del backend integrato.

- **Contratto, flussi e istruzioni di integrazione:** [docs/api-contract.md](../docs/api-contract.md).
- **OpenAPI 3.1, schemi ed esempi JSON completi:** [docs/api-contract.openapi.json](../docs/api-contract.openapi.json).
- **Politica scientifica:** [criteri-algoritmo.md](../docs/criteri-algoritmo.md), [stato-decisioni.md](../docs/stato-decisioni.md).

I cataloghi GeoJSON e le API di acquisizione `/api/data` già implementati restano distinti dalle API scientifiche da sviluppare. Il contratto aggiornato conserva FastAPI e archiviazione su file, elimina i punteggi pesati del mock dal ranking ufficiale e documenta baseline, confronti, grafici, eclissi, orbite e adattamenti frontend.

Per evitare specifiche discordanti, modificare il documento e lo schema collegati; non mantenere una seconda copia qui. La v1 rimane nella cronologia Git.
