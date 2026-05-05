import { BehaviorSubject } from 'rxjs';
import { MapListComponent } from './map-list.component';
import { FilterInfo } from '../../class/filterInfo';

describe('MapListComponent', () => {
    const createComponent = () => {
        const titleStub = { setTitle: vi.fn() };
        const cdStub = { detectChanges: vi.fn() };
        const routeStub = { snapshot: { paramMap: { get: () => null } } };
        const userInfoStub = {
            isCurrentUserAdmin: vi.fn().mockReturnValue(true),
            getuserInfo: vi.fn().mockReturnValue({ user_id: 1 })
        };
        const trslStub = { instant: (k: string) => k };

        return new MapListComponent(titleStub as any, cdStub as any, routeStub as any, userInfoStub as any, trslStub as any);
    };

    it('parseData maps point and polygon fields to marker/polygon metadata', () => {
        const component = createComponent();
        const bounds = { extend: vi.fn() };

        component.bounds = bounds as any;
        component.MARKER_LIB = { CollisionBehavior: { REQUIRED: 'required' } } as any;
        component.archetypeOptions = {
            titleField: 'name',
            infoField: 'desc'
        } as any;
        component.metaInfo = {
            columnMetadata: [
                { mc_ui_column_type: 'point', mc_nome_colonna: 'pt' },
                { mc_ui_column_type: 'polygon', mc_nome_colonna: 'poly' }
            ]
        } as any;

        const row = {
            name: 'Marker 1',
            desc: 'Info 1',
            pt: JSON.stringify({ lat: 1, lng: 2 }),
            poly: 'POLYGON ((2 1, 4 3, 6 5, 2 1))'
        };

        const result = component.parseData([row]);

        expect(result.length).toBe(1);
        expect(result[0].__marker.position).toEqual({ lat: 1, lng: 2 });
        expect(result[0].__marker.title).toBe('Marker 1');
        expect(result[0].__polygon.vertices.length).toBe(4);
        expect(bounds.extend).toHaveBeenCalled();
    });

    it('filterByBoundaries creates a maparea fixed filter and fetches data', () => {
        const component = createComponent();
        const fetchData = vi.fn();
        const ds = {
            filterInfo: null,
            fetchData
        };

        component.metaInfo = {
            columnMetadata: [{ mc_ui_column_type: 'point', mc_nome_colonna: 'pos' }]
        } as any;
        component.map = {
            googleMap: {
                getBounds: () => ({})
            }
        } as any;
        component.datasource = new BehaviorSubject<any>(ds);
        vi.spyOn(component, 'boundsToPolyline').mockReturnValue('POLYGON ((0 0,1 0,1 1,0 1,0 0))');

        component.filterByBoundaries();

        expect(ds.filterInfo instanceof FilterInfo).toBe(true);
        expect(ds.filterInfo.filters[0].field).toBe('pos');
        expect(ds.filterInfo.filters[0].operatore).toBe('maparea');
        expect(fetchData).toHaveBeenCalled();
    });

    it('renderMarkerInfo prioritizes infoFunction and falls back to marker values', () => {
        const component = createComponent();
        component.metaInfo = { pKey: { mc_nome_colonna: 'id' } } as any;
        component.archetypeOptions = { infoFunction: 'return record.custom + \"!\";' } as any;

        const custom = component.renderMarkerInfo({
            title: 'title',
            info: 'info',
            record: { id: 10, custom: 'hello' }
        });
        expect(custom).toBe('hello!');

        component.archetypeOptions = {} as any;
        const fallbackInfo = component.renderMarkerInfo({ info: 'details', title: 'title', record: { id: 10 } });
        expect(fallbackInfo).toBe('details');
    });

    it('getMarkerContent supports custom src field, static src and callback', () => {
        const component = createComponent();
        component.archetypeOptions = { customMarkerImageSrcField: 'icon' } as any;

        const fromField = component.getMarkerContent({ icon: '/assets/custom.png' }) as HTMLImageElement;
        expect(fromField.tagName.toLowerCase()).toBe('img');
        expect(fromField.src).toContain('/assets/custom.png');

        component.archetypeOptions = { customMarkerImageSrc: '/assets/static.png' } as any;
        const fromStatic = component.getMarkerContent({}) as HTMLImageElement;
        expect(fromStatic.src).toContain('/assets/static.png');

        component.archetypeOptions = { markerContentCallback: 'return record.label + \"-marker\";' } as any;
        expect(component.getMarkerContent({ label: 'A' })).toBe('A-marker');
    });

    it('zoomIn/zoomOut respect min/max zoom boundaries', () => {
        const component = createComponent();
        component.archetypeOptions = { minZoom: 3, maxZoom: 5 } as any;
        component.zoom = 5;

        component.zoomIn();
        expect(component.zoom).toBe(5);

        component.zoom = 3;
        component.zoomOut();
        expect(component.zoom).toBe(3);
    });

    it('e2e marker workflow opens info popup and sets selected marker context', () => {
        const component = createComponent();
        const markerElem = { nativeMarker: true } as any;
        const marker = { title: 'Marker A', info: 'Details', record: { id: 10 } };
        const infoSpy = {
            open: vi.fn().mockName("InfoWindow.open")
        };
        component.info = infoSpy as any;

        component.openInfo(markerElem, marker as any);

        expect(component.currentMarker).toEqual(marker as any);
        expect(infoSpy.open).toHaveBeenCalledWith(markerElem);
        expect(component.renderMarkerInfo(component.currentMarker)).toBe('Details');
    });

    it('filterByBoundaries does nothing when no geo columns are configured', () => {
        const component = createComponent();
        const fetchData = vi.fn();
        component.datasource = new BehaviorSubject<any>({ filterInfo: null, fetchData });
        component.metaInfo = { columnMetadata: [{ mc_ui_column_type: 'text', mc_nome_colonna: 'name' }] } as any;
        component.map = { googleMap: { getBounds: () => ({}) } } as any;

        component.filterByBoundaries();

        expect(fetchData).not.toHaveBeenCalled();
    });
});
