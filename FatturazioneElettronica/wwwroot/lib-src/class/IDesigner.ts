import { IDesignerProperties } from "./IDesignerProperties";

export interface IDesigner<T extends IDesignerProperties> {

    archetypeOptions: T;
}