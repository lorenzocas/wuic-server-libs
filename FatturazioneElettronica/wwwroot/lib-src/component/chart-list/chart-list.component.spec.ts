import { ChartListComponent } from './chart-list.component';

describe('ChartListComponent', () => {
    const createComponent = () => {
        const titleStub = { setTitle: vi.fn() };
        const cdStub = { detectChanges: vi.fn() };
        const routeStub = { snapshot: { paramMap: { get: () => null } } };
        const trslStub = { instant: (k: string) => k };
        const userInfoStub = {
            isCurrentUserAdmin: vi.fn().mockReturnValue(true),
            getuserInfo: vi.fn().mockReturnValue({ user_id: 1 })
        };

        return new ChartListComponent(titleStub as any, cdStub as any, routeStub as any, trslStub as any, userInfoStub as any);
    };

    it('parseData applies sorting and runtime cutOffCount', () => {
        const component = createComponent();
        component.ui.sortEnabled = true;
        component.ui.sortDir = 'desc';
        component.metaInfo = {
            tableMetadata: {
                extraProps: {
                    archetypes: {
                        chart: {
                            dataOptions: {
                                dataProperty: 'dato',
                                cutOffCount: 10,
                                datasets: [
                                    { label: 'Sales', labelField: 'label', dataField: 'value' }
                                ]
                            }
                        }
                    }
                }
            }
        } as any;

        const result = {
            dato: [
                { label: 'A', value: 3 },
                { label: 'B', value: 1 },
                { label: 'C', value: 5 }
            ]
        } as any;

        const chartData = component.parseData(result, 2);
        expect(chartData.labels).toEqual(['C', 'A']);
        expect(chartData.datasets[0].data).toEqual([5, 3]);
    });

    it('onChartTypeChanged sets user override and refreshes chart options', () => {
        const component = createComponent();
        component.metaInfo = { tableMetadata: { extraProps: { archetypes: {} }, md_props_bag: '{}' } } as any;
        component.selectedChartType = 'line';
        vi.spyOn<any>(component, 'refreshChartOptions');
        vi.spyOn<any>(component, 'persistChartArchetypeOptions');

        component.onChartTypeChanged();

        expect((component as any).hasUserChartTypeOverride).toBe(true);
        expect((component as any).refreshChartOptions).toHaveBeenCalled();
        expect((component as any).persistChartArchetypeOptions).toHaveBeenCalled();
    });

    it('applyCutoffValue clamps cutoff and rebuilds chart data', () => {
        const component = createComponent();
        component.metaInfo = {
            tableMetadata: {
                extraProps: { archetypes: { chart: { dataOptions: { dataProperty: 'dato', datasets: [{ label: 'S', labelField: 'label', dataField: 'value' }] } } } },
                md_props_bag: '{}'
            }
        } as any;
        component.totalRecords = 3;
        component.lastResultInfo = { dato: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }, { label: 'C', value: 3 }] } as any;
        vi.spyOn<any>(component, 'persistChartArchetypeOptions');

        (component as any).applyCutoffValue(100);

        expect(component.cutoffValue).toBe(3);
        expect(component.data.labels.length).toBe(3);
        expect((component as any).persistChartArchetypeOptions).toHaveBeenCalled();
    });

    it('parseData resolves aggregate field suffixes when base field is missing', () => {
        const component = createComponent();
        component.ui.sortEnabled = false;
        component.metaInfo = {
            tableMetadata: {
                extraProps: {
                    archetypes: {
                        chart: {
                            dataOptions: {
                                dataProperty: 'dato',
                                datasets: [
                                    { label: 'Sales', labelField: 'label', dataField: 'amount' }
                                ]
                            }
                        }
                    }
                }
            }
        } as any;

        const chartData = component.parseData({
            dato: [{ label: 'A', amount_SUM: 9 }]
        } as any, 10);

        expect(chartData.labels).toEqual(['A']);
        expect(chartData.datasets[0].data).toEqual([9]);
    });

    it('onWidgetOptionsChanged refreshes options, persists config and rebuilds data', () => {
        const component = createComponent();
        component.metaInfo = {
            tableMetadata: {
                extraProps: {
                    archetypes: {
                        chart: {
                            dataOptions: { dataProperty: 'dato', datasets: [{ label: 'S', labelField: 'label', dataField: 'value' }] }
                        }
                    }
                },
                md_props_bag: '{}'
            }
        } as any;
        component.lastResultInfo = { dato: [{ label: 'A', value: 1 }] } as any;
        component.cutoffValue = 1;
        vi.spyOn<any>(component, 'refreshChartOptions');
        vi.spyOn<any>(component, 'persistChartArchetypeOptions');

        component.onWidgetOptionsChanged();

        expect((component as any).refreshChartOptions).toHaveBeenCalled();
        expect((component as any).persistChartArchetypeOptions).toHaveBeenCalled();
        expect(component.data.labels).toEqual(['A']);
    });

    it('chart type helpers return expected values for selected type', () => {
        const component = createComponent();
        component.selectedChartType = 'bar';
        expect(component.isCartesianChart()).toBe(true);
        expect(component.isBarChart()).toBe(true);
        expect(component.isDoughnutLikeChart()).toBe(false);

        component.selectedChartType = 'doughnut';
        expect(component.isDoughnutLikeChart()).toBe(true);
        expect(component.isCartesianChart()).toBe(false);
    });

    it('e2e chart workflow rebuilds dataset after cutoff and chart type changes', () => {
        const component = createComponent();
        component.metaInfo = {
            tableMetadata: {
                extraProps: {
                    archetypes: {
                        chart: {
                            type: 'bar',
                            dataOptions: {
                                dataProperty: 'dato',
                                cutOffCount: 3,
                                datasets: [{ label: 'Values', labelField: 'label', dataField: 'value' }]
                            }
                        }
                    }
                },
                md_props_bag: '{}'
            }
        } as any;
        component.lastResultInfo = {
            dato: [
                { label: 'A', value: 10 },
                { label: 'B', value: 3 },
                { label: 'C', value: 6 },
                { label: 'D', value: 1 }
            ],
            totalRowCount: 4
        } as any;
        component.totalRecords = 4;

        component.data = component.parseData(component.lastResultInfo, 3);
        expect(component.data.labels.length).toBe(3);

        component.onCutoffValueChanged(2);
        expect(component.cutoffValue).toBe(2);
        expect(component.data.labels.length).toBe(2);

        component.selectedChartType = 'line';
        component.onChartTypeChanged();
        expect(component.chartOptions.type).toBe('line');
        expect(component.data.labels.length).toBe(2);
    });
});
