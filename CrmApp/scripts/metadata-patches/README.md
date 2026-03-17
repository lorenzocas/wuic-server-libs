# Metadata Patch Workflow

Questo folder contiene patch **incrementali per richiesta**.

Obiettivo:
- evitare che uno script monolitico riscriva metadata gia modificati da UI (`metadata-editor`);
- applicare solo le patch necessarie e tracciabili.

## Regole
- una richiesta = uno script patch dedicato;
- ogni patch deve essere idempotente;
- le patch non partono automaticamente.

## Esecuzione

1. Aggiornare `manifest.ps1` con la nuova patch.
2. Eseguire esplicitamente il runner:

```powershell
& "scripts/run-metadata-patches.ps1" -PatchIds "20260317_example"
```

Per vedere le patch disponibili:

```powershell
& "scripts/run-metadata-patches.ps1" -ListOnly
```

