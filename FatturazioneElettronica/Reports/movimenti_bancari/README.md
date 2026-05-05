# Import movimenti bancari — schema file Excel/CSV

L'azione **"Importa movimenti"** (toolbar action sulla list-grid di
`Movimenti bancari`) accetta file Excel `.xls`/`.xlsx` o CSV `.csv`
con la **prima riga di header** secondo lo schema sotto.

## Header obbligatorio

| Colonna           | Tipo     | Obbligatoria | Note                                                                                  |
|-------------------|----------|--------------|---------------------------------------------------------------------------------------|
| `Data Operazione` | data     | ✓            | `dd/MM/yyyy` (IT) o `yyyy-MM-dd` (ISO)                                                |
| `Data Valuta`     | data     |              | stesso formato di `Data Operazione` (opzionale)                                       |
| `Importo`         | decimale | ✓            | virgola IT (`1.234,56`) o punto EN (`1234.56`); positivo = accredito, negativo = addebito |
| `Causale`         | testo    |              | es. `BONIFICO`, `RIBA`, `ADDEBITO`, `ACCREDITO`, max 50 char                          |
| `Descrizione`     | testo    |              | testo libero                                                                          |
| `IBAN Controparte`| testo    |              | IBAN della controparte (per match riconciliazione), max 34 char                       |
| `Nome Controparte`| testo    |              | nome cliente/fornitore controparte, max 300 char                                      |
| `Riferimento`     | testo    |              | numero documento collegato, max 200 char                                              |

I header sono **case-sensitive** — devono corrispondere esattamente
(spazi inclusi).

## Esempio

[`template.csv`](template.csv) contiene un esempio con 5 righe:

```csv
Data Operazione;Data Valuta;Importo;Causale;Descrizione;IBAN Controparte;Nome Controparte;Riferimento
2026-05-04;2026-05-05;122,00;BONIFICO;Pagamento fattura 1/2026;IT60X0542811101000000123456;Cliente Test SRL;F1/2026
2026-05-06;;-50,00;ADDEBITO;Commissioni bancarie mensili;;;
...
```

Per uso con Excel: aprire il `.csv` e salvare come `.xlsx`.

## Flow tecnico (per developer)

1. Action tabella `md_action_type=10` su route `movimenti_bancari`
   apre `wtoolbox.uploadDialog({ target_table: 'mov_bancari_imp_tmp',
   stored_name: 'dbo.sp_movimenti_bancari_import', mode: 'replace' })`.
2. Framework crea/replace la temp `mov_bancari_imp_tmp` con tutte le
   colonne come `NVARCHAR(MAX)` (header del file = nomi colonne temp).
3. `SqlBulkCopy` riversa il DataTable parsato dal file Excel/CSV.
4. Framework chiama
   [`sp_movimenti_bancari_import(@TableName, @UserId, @RowCount)`](../../dbms/schema/10_import_export.sql).
5. La stored:
   - risolve `banca_id` (banca predefinita o prima attiva)
   - genera `import_batch_id` univoco (NEWID)
   - costruisce `INSERT INTO dbo.movimenti_bancari` via
     `sp_executesql` su `[mov_bancari_imp_tmp]`
   - parsing date IT/ISO con `TRY_CONVERT` + fallback
   - parsing importo IT/EN con `REPLACE` mirato
   - filtra righe vuote (no data o no importo)
   - ritorna `(rows_imported, batch_id, banca_id, rows_in_temp, user_id)`
6. Le righe importate hanno `match_status='UNMATCHED'` — successivo
   `Riconciliazione` (action `matchAuto` del `RiconciliazioneController`)
   le abbinerà automaticamente alle scadenze aperte per importo + data
   ±N giorni.

## Banca di destinazione

Lo script seleziona automaticamente la banca usando questa priorità:

1. `banche.predefinita = 1` (se esiste UNA banca segnata predefinita)
2. prima banca con `attivo=1` e `cancellato=0` (fallback)

Per usare una banca specifica diversa dalla predefinita, modificare
la stored o aggiungere prima dell'import:

```sql
UPDATE dbo.banche SET predefinita = 0;
UPDATE dbo.banche SET predefinita = 1 WHERE id = <id_banca_target>;
```
