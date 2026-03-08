# NugetHost

Host ASP.NET Core minimale che esegue `KonvergenceCore` come dipendenza NuGet (`KonvergenceCore` 1.0.0).

## Cosa fa

- Carica `WuicCore.Startup` dal pacchetto NuGet.
- Si mette in ascolto su `http://localhost:5000`.
- Riusa `../KonvergenceCore` come content root per mantenere static files e parte Angular.

## Prerequisiti

- Pacchetto locale in `../KonvergenceCore/nupkg_slim/KonvergenceCore.1.0.0.nupkg`.

## Avvio

```powershell
dotnet run --project .\NugetHost\NugetHost.csproj
```

## Override root contenuti

Se serve una root diversa:

```powershell
$env:KONVERGENCECORE_ROOT = "C:\\path\\to\\KonvergenceCore"
dotnet run --project .\NugetHost\NugetHost.csproj
```

## Parametro appsettings per static/angular

Nel progetto `NugetHost` puoi configurare la root dei contenuti statici/Angular con:

```json
"NugetHost": {
	"StaticAngularRoot": "..\\KonvergenceCore"
}
```

`KONVERGENCECORE_ROOT` (variabile ambiente) ha priorita` su questo valore.
