import { MetadatiColonna } from './metadati_colonna';
import { WtoolboxService } from '../service/wtoolbox.service';

describe('MetadatiColonna.formatGridViewValue', () => {
    it('returns dictionary description for dictionary columns', () => {
        const col = new MetadatiColonna('status');
        col.mc_ui_column_type = 'dictionary';
        col.mc_dictionary_value = '0@@draft||1@@approved';
        const row = { status: 1 };

        expect(MetadatiColonna.formatGridViewValue(col, row)).toBe('approved');
    });

    it('keeps raw value when dictionary entry is missing', () => {
        const col = new MetadatiColonna('status');
        col.mc_ui_column_type = 'dictionary';
        col.mc_dictionary_value = '0@@draft||1@@approved';
        const row = { status: 2 };

        expect(MetadatiColonna.formatGridViewValue(col, row)).toBe(2);
    });

    it('translates dictionary description when translation service is available', () => {
        const col = new MetadatiColonna('status');
        col.mc_ui_column_type = 'dictionary_radio';
        col.mc_dictionary_value = '1@@dictionary.approved';
        const row = { status: 1 };
        const previous = WtoolboxService.translationService;
        (WtoolboxService as any).translationService = { instant: (key: string) => `TR:${key}` };

        try {
            expect(MetadatiColonna.formatGridViewValue(col, row)).toBe('TR:dictionary.approved');
        }
        finally {
            (WtoolboxService as any).translationService = previous;
        }
    });

    it('uses mc_ui_grid_column_data_template when provided as expression', () => {
        const col = new MetadatiColonna('status');
        col.mc_ui_grid_column_data_template = "#= data.status + '!' #";
        const row = { status: 'approved' };

        expect(MetadatiColonna.formatGridViewValue(col, row)).toBe('approved!');
    });

    it('falls back to default formatting when mc_ui_grid_column_data_template is invalid', () => {
        const col = new MetadatiColonna('status');
        col.mc_ui_grid_column_data_template = "<span>{{ rowData.status }}</span>";
        col.mc_ui_slider_format = 'N';
        col.mc_ui_slider_decimals = 2;
        const row = { status: 1234.5 };

        expect(MetadatiColonna.formatGridViewValue(col, row)).toBe('1,234.50');
    });
});
