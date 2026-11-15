# Contratto API per il backend

**Revisione 3.0 — 15 novembre 2026.** La specifica corrente è [docs/api-contract.md](../docs/api-contract.md), con stato reale degli endpoint, parametri, flussi e decisioni aperte. Il backend del repository usa **FastAPI e file**; la scienza approvata è in [criteri-algoritmo.md](../docs/criteri-algoritmo.md).

Per implementare e integrare:

- [Mappa completa delle interazioni e dei punti di intervento](../docs/api-integration-map.md): 150 punti di interazione, 25 effetti, 18 accessi dati, riferimenti di riga e 42 punti di integrazione.
- [Dizionario dei dati e delle visualizzazioni](../docs/api-data-dictionary.md): JSON esistenti, consumatori e dati ancora da definire.
- [Piano TanStack Query](../docs/api-query-plan.md): chiavi, dipendenze, polling e stati; proposta non ancora installata.
- [Manifest verificabile](../docs/api-integration-map.json): hash e ancore del codice censito.

**Non è ancora chiuso il DTO scientifico finale.** Nove decisioni aperte U01–U09 sono documentate con evidenze; soprattutto Overall/Best, confronto regionale, nuovi risultati con frazioni e unknown, job e frame orbitali. Non implementare uno score globale o URL/campi non concordati. Gli endpoint scientifici sono ancora assenti dal server.

Il [contratto precedente](API_CONTRACT.v1-archive.md) è conservato integralmente come archivio. Le sue ipotesi scientifiche e proposte HTTP non sostituiscono la revisione corrente.

Verifica statica dalla radice: `python3 scripts/verify_api_integration.py`. Non avvia UI né servizi e non modifica i file.

Lo schema OpenAPI della precedente proposta v2 è conservato in `backend/API_CONTRACT.v2-openapi-archive.json` come archivio non normativo. Non definisce i DTO scientifici finali della revisione corrente.
