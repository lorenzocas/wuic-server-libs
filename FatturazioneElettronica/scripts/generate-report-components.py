"""
Aggiunge Text components alle DataBand di Report_NEW.mrt per renderizzare:
- Testata fattura (cliente + dati documento)
- Tabella righe
- Lista scadenze
- Footer totali (ReportSummaryBand)

Strategia: trova le bande esistenti (ReportTitleBand2, fatture_inviate_data,
fatture_inviate_righe_header, fatture_inviate_righe_data, scadenze_header,
scadenze_data) e popola i loro Components. Aggiunge una SummaryBand al fondo
del Components della Page1.

Page A4: 21 cm × 29.7 cm. Margins 1 cm → contenuto 19 cm di larghezza.
"""
from pathlib import Path

P = Path(r'C:\src\Wuic\FatturazioneElettronica\Reports\fatture_inviate\Report_NEW.mrt')
content = P.read_text(encoding='utf-8')

REF = 100  # ref base per i Text components nuovi (parto alto per evitare collisioni)

def text(name, parent_ref, page_ref, x, y, w, h, expr_or_str, font='Arial,8',
         is_expr=True, halign='Left', valign='Center', bold=False):
    global REF
    REF += 1
    border = 'None;Black;1;Solid;False;4;Black' if not bold else 'All;Black;1;Solid;False;4;Black'
    fnt = font + (',Bold' if bold else '')
    return f"""            <{name} Ref="{REF}" type="Text" isKey="true">
              <Border>{border}</Border>
              <Brush>Transparent</Brush>
              <ClientRectangle>{x},{y},{w},{h}</ClientRectangle>
              <Conditions isList="true" count="0" />
              <Expressions isList="true" count="0" />
              <Font>{fnt}</Font>
              <HorAlignment>{halign}</HorAlignment>
              <Name>{name}</Name>
              <Page isRef="{page_ref}" />
              <Parent isRef="{parent_ref}" />
              <Text>{expr_or_str}</Text>
              <TextBrush>Black</TextBrush>
              <Type>{'Expression' if is_expr else 'Text'}</Type>
              <VertAlignment>{valign}</VertAlignment>
            </{name}>
"""

# ============================================================================
# ReportTitleBand2 → titolo grande
# ============================================================================
PAGE_REF = 8
RTB_REF = 9  # ReportTitleBand2 ref nel file originale
TITLE_TEXT = text('TitleNumero', RTB_REF, PAGE_REF, 0, 0, 19, 0.6,
                  '{"FATTURA N. " + fatture_inviate.numero + "  del  " + fatture_inviate.data_documento.ToString("dd/MM/yyyy")}',
                  font='Arial,16', halign='Center', bold=True)

OLD = '''        <ReportTitleBand2 Ref="9" type="ReportTitleBand" isKey="true">
          <Brush>Transparent</Brush>
          <ClientRectangle>0,0.4,19,0.6</ClientRectangle>
          <Components isList="true" count="0" />'''
NEW = f'''        <ReportTitleBand2 Ref="9" type="ReportTitleBand" isKey="true">
          <Brush>Transparent</Brush>
          <ClientRectangle>0,0.4,19,1</ClientRectangle>
          <Components isList="true" count="1">
{TITLE_TEXT}          </Components>'''
assert OLD in content, 'ReportTitleBand2 non trovato'
content = content.replace(OLD, NEW)

# ============================================================================
# fatture_inviate_data (testata cliente + documento)
# ============================================================================
DATA_REF = 11
# Layout: 2 colonne (sinistra: cliente; destra: documento), 5 righe
# Colonna sinistra (0..9.5): cliente
# Colonna destra (9.5..19): documento
TESTATA_LINES = []
y = 0
TESTATA_LINES.append(text('LblCliente', DATA_REF, PAGE_REF, 0, y, 2.5, 0.5,
                          'Cliente:', font='Arial,8', is_expr=False, bold=True))
TESTATA_LINES.append(text('TxtCliente', DATA_REF, PAGE_REF, 2.5, y, 7, 0.5,
                          '{fatture_inviate.clienti___ragione_sociale__cliente_id}', font='Arial,8'))
TESTATA_LINES.append(text('LblPagamento', DATA_REF, PAGE_REF, 9.5, y, 2.5, 0.5,
                          'Pagamento:', font='Arial,8', is_expr=False, bold=True))
TESTATA_LINES.append(text('TxtPagamento', DATA_REF, PAGE_REF, 12, y, 7, 0.5,
                          '{fatture_inviate.pagamenti___descrizione__pagamento_id}', font='Arial,8'))
y += 0.5
TESTATA_LINES.append(text('LblPiva', DATA_REF, PAGE_REF, 0, y, 2.5, 0.5,
                          'P.IVA:', font='Arial,8', is_expr=False, bold=True))
# P.IVA non è in fatture_inviate; usa columns join cliente_partita_iva se mappato.
# Fallback: vuoto.
TESTATA_LINES.append(text('TxtPiva', DATA_REF, PAGE_REF, 2.5, y, 7, 0.5,
                          ' ', font='Arial,8', is_expr=False))
TESTATA_LINES.append(text('LblBanca', DATA_REF, PAGE_REF, 9.5, y, 2.5, 0.5,
                          'Banca:', font='Arial,8', is_expr=False, bold=True))
TESTATA_LINES.append(text('TxtBanca', DATA_REF, PAGE_REF, 12, y, 7, 0.5,
                          '{fatture_inviate.banche___descrizione__banca_id}', font='Arial,8'))
y += 0.5
TESTATA_LINES.append(text('LblCausale', DATA_REF, PAGE_REF, 0, y, 2.5, 0.5,
                          'Causale:', font='Arial,8', is_expr=False, bold=True))
TESTATA_LINES.append(text('TxtCausale', DATA_REF, PAGE_REF, 2.5, y, 7, 0.5,
                          '{fatture_inviate.causale}', font='Arial,8'))
TESTATA_LINES.append(text('LblRifOrdine', DATA_REF, PAGE_REF, 9.5, y, 2.5, 0.5,
                          'Rif. ordine:', font='Arial,8', is_expr=False, bold=True))
TESTATA_LINES.append(text('TxtRifOrdine', DATA_REF, PAGE_REF, 12, y, 7, 0.5,
                          '{fatture_inviate.riferimento_ordine}', font='Arial,8'))
y += 0.5
TESTATA_LINES.append(text('LblNote', DATA_REF, PAGE_REF, 0, y, 2.5, 0.5,
                          'Note:', font='Arial,8', is_expr=False, bold=True))
TESTATA_LINES.append(text('TxtNote', DATA_REF, PAGE_REF, 2.5, y, 16.5, 0.5,
                          '{fatture_inviate.note}', font='Arial,8'))

testata_xml = ''.join(TESTATA_LINES)
testata_count = len(TESTATA_LINES)
OLD = '''        <fatture_inviate_data Ref="11" type="DataBand" isKey="true">
          <Brush>Transparent</Brush>
          <BusinessObjectGuid isNull="true" />
          <ClientRectangle>0,3.2,19,0.6</ClientRectangle>
          <Components isList="true" count="1">
            <Text1 Ref="12" type="Text" isKey="true">
              <Brush>Transparent</Brush>
              <ClientRectangle>-0,0,3,0.6</ClientRectangle>
              <Conditions isList="true" count="0" />
              <Expressions isList="true" count="0" />
              <Font>Arial,8</Font>
              <Name>Text1</Name>
              <Page isRef="8" />
              <Parent isRef="11" />
              <Text>{fatture_inviate.anno}</Text>
              <TextBrush>Black</TextBrush>
            </Text1>
          </Components>'''
NEW = f'''        <fatture_inviate_data Ref="11" type="DataBand" isKey="true">
          <Brush>Transparent</Brush>
          <BusinessObjectGuid isNull="true" />
          <ClientRectangle>0,1.6,19,2</ClientRectangle>
          <Components isList="true" count="{testata_count}">
{testata_xml}          </Components>'''
assert OLD in content, 'fatture_inviate_data block non trovato'
content = content.replace(OLD, NEW)

# ============================================================================
# fatture_inviate_righe_header (header tabella righe)
# ============================================================================
RIGHE_HDR_REF = 13
HDR_LINES = []
# 9 colonne: Riga (1cm) | Prodotto (5cm) | Descrizione (4cm) | Qta (1.5cm) | UM (1cm) | Prezzo (2cm) | Sconto% (1.5cm) | IVA (1.5cm) | Tot.riga (1.5cm) — total ~19cm
HDR_LINES.append(text('HRiga', RIGHE_HDR_REF, PAGE_REF, 0, 0, 1, 0.6, 'N.', font='Arial,8', is_expr=False, halign='Center', bold=True))
HDR_LINES.append(text('HProdotto', RIGHE_HDR_REF, PAGE_REF, 1, 0, 5, 0.6, 'Prodotto', font='Arial,8', is_expr=False, halign='Left', bold=True))
HDR_LINES.append(text('HDescrizione', RIGHE_HDR_REF, PAGE_REF, 6, 0, 4, 0.6, 'Descrizione', font='Arial,8', is_expr=False, halign='Left', bold=True))
HDR_LINES.append(text('HQta', RIGHE_HDR_REF, PAGE_REF, 10, 0, 1.5, 0.6, 'Qta', font='Arial,8', is_expr=False, halign='Right', bold=True))
HDR_LINES.append(text('HUM', RIGHE_HDR_REF, PAGE_REF, 11.5, 0, 1, 0.6, 'UM', font='Arial,8', is_expr=False, halign='Center', bold=True))
HDR_LINES.append(text('HPrezzo', RIGHE_HDR_REF, PAGE_REF, 12.5, 0, 2, 0.6, 'Prezzo', font='Arial,8', is_expr=False, halign='Right', bold=True))
HDR_LINES.append(text('HSconto', RIGHE_HDR_REF, PAGE_REF, 14.5, 0, 1.5, 0.6, 'Sc.%', font='Arial,8', is_expr=False, halign='Right', bold=True))
HDR_LINES.append(text('HIva', RIGHE_HDR_REF, PAGE_REF, 16, 0, 1.5, 0.6, 'IVA', font='Arial,8', is_expr=False, halign='Center', bold=True))
HDR_LINES.append(text('HTotRiga', RIGHE_HDR_REF, PAGE_REF, 17.5, 0, 1.5, 0.6, 'Totale', font='Arial,8', is_expr=False, halign='Right', bold=True))

hdr_xml = ''.join(HDR_LINES)
hdr_count = len(HDR_LINES)
OLD = '''        <fatture_inviate_righe_header Ref="13" type="HeaderBand" isKey="true">
          <Brush>Transparent</Brush>
          <ClientRectangle>0,4.6,19,0.6</ClientRectangle>
          <Components isList="true" count="0" />'''
NEW = f'''        <fatture_inviate_righe_header Ref="13" type="HeaderBand" isKey="true">
          <Brush>LightGray</Brush>
          <ClientRectangle>0,3.8,19,0.6</ClientRectangle>
          <Components isList="true" count="{hdr_count}">
{hdr_xml}          </Components>'''
assert OLD in content, 'fatture_inviate_righe_header non trovato'
content = content.replace(OLD, NEW)

# ============================================================================
# fatture_inviate_righe_data (row riga)
# ============================================================================
RIGHE_DATA_REF = 14
DATA_LINES = []
DATA_LINES.append(text('DRiga', RIGHE_DATA_REF, PAGE_REF, 0, 0, 1, 0.6, '{fatture_inviate_righe.riga}', halign='Center'))
DATA_LINES.append(text('DProdotto', RIGHE_DATA_REF, PAGE_REF, 1, 0, 5, 0.6, '{fatture_inviate_righe.prodotti___descrizione__prodotto_id}', halign='Left'))
DATA_LINES.append(text('DDescrizione', RIGHE_DATA_REF, PAGE_REF, 6, 0, 4, 0.6, '{fatture_inviate_righe.descrizione}', halign='Left'))
DATA_LINES.append(text('DQta', RIGHE_DATA_REF, PAGE_REF, 10, 0, 1.5, 0.6, '{fatture_inviate_righe.quantita.ToString("N2")}', halign='Right'))
DATA_LINES.append(text('DUM', RIGHE_DATA_REF, PAGE_REF, 11.5, 0, 1, 0.6, '{fatture_inviate_righe.unita_misura___codice__unita_misura_id}', halign='Center'))
DATA_LINES.append(text('DPrezzo', RIGHE_DATA_REF, PAGE_REF, 12.5, 0, 2, 0.6, '{fatture_inviate_righe.prezzo_unitario.ToString("N2")}', halign='Right'))
DATA_LINES.append(text('DSconto', RIGHE_DATA_REF, PAGE_REF, 14.5, 0, 1.5, 0.6, '{fatture_inviate_righe.sconto_perc.ToString("N2")}', halign='Right'))
DATA_LINES.append(text('DIva', RIGHE_DATA_REF, PAGE_REF, 16, 0, 1.5, 0.6, '{fatture_inviate_righe.codici_iva___descrizione__codice_iva_id}', halign='Center'))
DATA_LINES.append(text('DTotRiga', RIGHE_DATA_REF, PAGE_REF, 17.5, 0, 1.5, 0.6, '{fatture_inviate_righe.totale_riga.ToString("N2")}', halign='Right'))

data_xml = ''.join(DATA_LINES)
data_count = len(DATA_LINES)
OLD = '''        <fatture_inviate_righe_data Ref="14" type="DataBand" isKey="true">
          <Brush>Transparent</Brush>
          <BusinessObjectGuid isNull="true" />
          <ClientRectangle>0,6,19,0.6</ClientRectangle>
          <Components isList="true" count="0" />'''
NEW = f'''        <fatture_inviate_righe_data Ref="14" type="DataBand" isKey="true">
          <Brush>Transparent</Brush>
          <BusinessObjectGuid isNull="true" />
          <ClientRectangle>0,4.4,19,0.6</ClientRectangle>
          <Components isList="true" count="{data_count}">
{data_xml}          </Components>'''
assert OLD in content, 'fatture_inviate_righe_data non trovato'
content = content.replace(OLD, NEW)

# ============================================================================
# scadenze_header
# ============================================================================
SCAD_HDR_REF = 15
SCAD_HDR_LINES = []
SCAD_HDR_LINES.append(text('SHTitle', SCAD_HDR_REF, PAGE_REF, 0, 0, 19, 0.5, 'SCADENZE', font='Arial,9', is_expr=False, halign='Left', bold=True))
SCAD_HDR_LINES.append(text('SHRata', SCAD_HDR_REF, PAGE_REF, 0, 0.5, 1.5, 0.5, 'Rata', font='Arial,8', is_expr=False, halign='Center', bold=True))
SCAD_HDR_LINES.append(text('SHData', SCAD_HDR_REF, PAGE_REF, 1.5, 0.5, 3, 0.5, 'Data scadenza', font='Arial,8', is_expr=False, halign='Center', bold=True))
SCAD_HDR_LINES.append(text('SHImporto', SCAD_HDR_REF, PAGE_REF, 4.5, 0.5, 3, 0.5, 'Importo', font='Arial,8', is_expr=False, halign='Right', bold=True))
SCAD_HDR_LINES.append(text('SHPagamento', SCAD_HDR_REF, PAGE_REF, 7.5, 0.5, 7, 0.5, 'Pagamento', font='Arial,8', is_expr=False, halign='Left', bold=True))
SCAD_HDR_LINES.append(text('SHStato', SCAD_HDR_REF, PAGE_REF, 14.5, 0.5, 4.5, 0.5, 'Stato', font='Arial,8', is_expr=False, halign='Center', bold=True))

scad_hdr_xml = ''.join(SCAD_HDR_LINES)
OLD = '''        <scadenze_header Ref="15" type="HeaderBand" isKey="true">
          <Brush>Transparent</Brush>
          <ClientRectangle>0,7.4,19,0.6</ClientRectangle>
          <Components isList="true" count="0" />'''
NEW = f'''        <scadenze_header Ref="15" type="HeaderBand" isKey="true">
          <Brush>Transparent</Brush>
          <ClientRectangle>0,5.5,19,1</ClientRectangle>
          <Components isList="true" count="{len(SCAD_HDR_LINES)}">
{scad_hdr_xml}          </Components>'''
assert OLD in content, 'scadenze_header non trovato'
content = content.replace(OLD, NEW)

# ============================================================================
# scadenze_data
# ============================================================================
SCAD_DATA_REF = 16
SCAD_DATA_LINES = []
SCAD_DATA_LINES.append(text('SDRata', SCAD_DATA_REF, PAGE_REF, 0, 0, 1.5, 0.5, '{scadenze.rata_n + " / " + scadenze.rata_totale}', halign='Center'))
SCAD_DATA_LINES.append(text('SDData', SCAD_DATA_REF, PAGE_REF, 1.5, 0, 3, 0.5, '{scadenze.data_scadenza.ToString("dd/MM/yyyy")}', halign='Center'))
SCAD_DATA_LINES.append(text('SDImporto', SCAD_DATA_REF, PAGE_REF, 4.5, 0, 3, 0.5, '{scadenze.importo.ToString("N2")}', halign='Right'))
SCAD_DATA_LINES.append(text('SDPagamento', SCAD_DATA_REF, PAGE_REF, 7.5, 0, 7, 0.5, '{scadenze.pagamenti___descrizione__pagamento_id}', halign='Left'))
SCAD_DATA_LINES.append(text('SDStato', SCAD_DATA_REF, PAGE_REF, 14.5, 0, 4.5, 0.5, '{scadenze.stato}', halign='Center'))

scad_data_xml = ''.join(SCAD_DATA_LINES)
OLD = '''        <scadenze_data Ref="16" type="DataBand" isKey="true">
          <Brush>Transparent</Brush>
          <BusinessObjectGuid isNull="true" />
          <ClientRectangle>0,8.8,19,0.6</ClientRectangle>
          <Components isList="true" count="0" />'''
NEW = f'''        <scadenze_data Ref="16" type="DataBand" isKey="true">
          <Brush>Transparent</Brush>
          <BusinessObjectGuid isNull="true" />
          <ClientRectangle>0,6.6,19,0.5</ClientRectangle>
          <Components isList="true" count="{len(SCAD_DATA_LINES)}">
{scad_data_xml}          </Components>'''
assert OLD in content, 'scadenze_data non trovato'
content = content.replace(OLD, NEW)

# ============================================================================
# Aggiungo ReportSummaryBand (footer totali) dentro Page1.Components
# ============================================================================
SUMMARY_REF = 200
SUMMARY_LINES = []
y_s = 0
SUMMARY_LINES.append(text('SUMTitle', SUMMARY_REF, PAGE_REF, 0, y_s, 19, 0.6, 'TOTALI DOCUMENTO', font='Arial,9', is_expr=False, halign='Right', bold=True))
y_s += 0.6
SUMMARY_LINES.append(text('SUMLblImp', SUMMARY_REF, PAGE_REF, 12, y_s, 4, 0.5, 'Imponibile:', font='Arial,8', is_expr=False, halign='Right', bold=True))
SUMMARY_LINES.append(text('SUMValImp', SUMMARY_REF, PAGE_REF, 16, y_s, 3, 0.5, '{fatture_inviate.imponibile.ToString("N2")}', halign='Right'))
y_s += 0.5
SUMMARY_LINES.append(text('SUMLblIva', SUMMARY_REF, PAGE_REF, 12, y_s, 4, 0.5, 'IVA:', font='Arial,8', is_expr=False, halign='Right', bold=True))
SUMMARY_LINES.append(text('SUMValIva', SUMMARY_REF, PAGE_REF, 16, y_s, 3, 0.5, '{fatture_inviate.iva.ToString("N2")}', halign='Right'))
y_s += 0.5
SUMMARY_LINES.append(text('SUMLblBollo', SUMMARY_REF, PAGE_REF, 12, y_s, 4, 0.5, 'Bollo:', font='Arial,8', is_expr=False, halign='Right', bold=True))
SUMMARY_LINES.append(text('SUMValBollo', SUMMARY_REF, PAGE_REF, 16, y_s, 3, 0.5, '{fatture_inviate.bollo_valore.ToString("N2")}', halign='Right'))
y_s += 0.5
SUMMARY_LINES.append(text('SUMLblScGlob', SUMMARY_REF, PAGE_REF, 12, y_s, 4, 0.5, 'Sconto globale %:', font='Arial,8', is_expr=False, halign='Right', bold=True))
SUMMARY_LINES.append(text('SUMValScGlob', SUMMARY_REF, PAGE_REF, 16, y_s, 3, 0.5, '{fatture_inviate.sconto_globale_perc.ToString("N2")}', halign='Right'))
y_s += 0.5
SUMMARY_LINES.append(text('SUMLblTot', SUMMARY_REF, PAGE_REF, 12, y_s, 4, 0.6, 'TOTALE FATTURA:', font='Arial,10', is_expr=False, halign='Right', bold=True))
SUMMARY_LINES.append(text('SUMValTot', SUMMARY_REF, PAGE_REF, 16, y_s, 3, 0.6, '{fatture_inviate.totale.ToString("N2")}', font='Arial,10', halign='Right', bold=True))

summary_xml = ''.join(SUMMARY_LINES)
SUMMARY_BAND = f'''        <ReportSummaryBand1 Ref="{SUMMARY_REF}" type="ReportSummaryBand" isKey="true">
          <Brush>Transparent</Brush>
          <ClientRectangle>0,7.4,19,3.4</ClientRectangle>
          <Components isList="true" count="{len(SUMMARY_LINES)}">
{summary_xml}          </Components>
          <Conditions isList="true" count="0" />
          <Expressions isList="true" count="0" />
          <Name>ReportSummaryBand1</Name>
          <Page isRef="{PAGE_REF}" />
          <Parent isRef="{PAGE_REF}" />
        </ReportSummaryBand1>
'''

# Page Components count attualmente "7" — diventa "8"
# Inserisco SUMMARY_BAND prima di </Components> della Page1
OLD_PAGE = '''      <Components isList="true" count="7">'''
NEW_PAGE = '''      <Components isList="true" count="8">'''
assert OLD_PAGE in content, 'Page1 Components count="7" non trovato'
content = content.replace(OLD_PAGE, NEW_PAGE)

# Inserisco la SummaryBand prima di </Components>      Conditions block del Page1.
# Il marker e' "      </Components>\n      <Conditions" (chiusura Components di Page1)
# Page1 termina con: scadenze_data </scadenze_data> | poi </Components> | <Conditions>
INSERT_BEFORE = '''      </Components>
      <Conditions isList="true" count="0" />
      <Expressions isList="true" count="0" />
      <Guid>'''
assert INSERT_BEFORE in content, 'Page1 close Components block non trovato'
content = content.replace(INSERT_BEFORE, SUMMARY_BAND + INSERT_BEFORE)

P.write_text(content, encoding='utf-8')
print(f'OK. Components count: testata={testata_count}, righeHdr={hdr_count}, righeData={data_count}, scadHdr={len(SCAD_HDR_LINES)}, scadData={len(SCAD_DATA_LINES)}, summary={len(SUMMARY_LINES)}')
