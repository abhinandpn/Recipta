export namespace model {
	
	export class Asset {
	    id: string;
	    projectId: string;
	    originalFilename: string;
	    storedPath: string;
	    fileType: string;
	    width: number;
	    height: number;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new Asset(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.projectId = source["projectId"];
	        this.originalFilename = source["originalFilename"];
	        this.storedPath = source["storedPath"];
	        this.fileType = source["fileType"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CanvasObject {
	    id: string;
	    projectId: string;
	    layerId: string;
	    type: string;
	    x: number;
	    y: number;
	    width: number;
	    height: number;
	    rotation: number;
	    propertiesJson: string;
	
	    static createFrom(source: any = {}) {
	        return new CanvasObject(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.projectId = source["projectId"];
	        this.layerId = source["layerId"];
	        this.type = source["type"];
	        this.x = source["x"];
	        this.y = source["y"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.rotation = source["rotation"];
	        this.propertiesJson = source["propertiesJson"];
	    }
	}
	export class CropBleedSettings {
	    id: string;
	    projectId: string;
	    cropMarksEnabled: boolean;
	    bleedEnabled: boolean;
	    bleedSize: number;
	    cropMarkLength: number;
	    cropMarkOffset: number;
	
	    static createFrom(source: any = {}) {
	        return new CropBleedSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.projectId = source["projectId"];
	        this.cropMarksEnabled = source["cropMarksEnabled"];
	        this.bleedEnabled = source["bleedEnabled"];
	        this.bleedSize = source["bleedSize"];
	        this.cropMarkLength = source["cropMarkLength"];
	        this.cropMarkOffset = source["cropMarkOffset"];
	    }
	}
	export class ItemPosition {
	    row: number;
	    col: number;
	    x: number;
	    y: number;
	    width: number;
	    height: number;
	
	    static createFrom(source: any = {}) {
	        return new ItemPosition(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.row = source["row"];
	        this.col = source["col"];
	        this.x = source["x"];
	        this.y = source["y"];
	        this.width = source["width"];
	        this.height = source["height"];
	    }
	}
	export class Layer {
	    id: string;
	    projectId: string;
	    name: string;
	    orderIndex: number;
	    isVisible: boolean;
	    isLocked: boolean;
	    objects?: CanvasObject[];
	
	    static createFrom(source: any = {}) {
	        return new Layer(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.projectId = source["projectId"];
	        this.name = source["name"];
	        this.orderIndex = source["orderIndex"];
	        this.isVisible = source["isVisible"];
	        this.isLocked = source["isLocked"];
	        this.objects = this.convertValues(source["objects"], CanvasObject);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ManualNumber {
	    id: string;
	    projectId: string;
	    sequenceOrder: number;
	    numberValue: string;
	    isValid: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ManualNumber(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.projectId = source["projectId"];
	        this.sequenceOrder = source["sequenceOrder"];
	        this.numberValue = source["numberValue"];
	        this.isValid = source["isValid"];
	    }
	}
	export class NumberItem {
	    id: string;
	    projectId: string;
	    itemIndex: number;
	    numberValue: string;
	    x: number;
	    y: number;
	    width: number;
	    height: number;
	    rotation: number;
	    fontFamily: string;
	    fontSize: number;
	    fontStyle: string;
	    fontColor: string;
	    letterSpacing: number;
	    alignment: string;
	    isVisible: boolean;
	    isLocked: boolean;
	    isOverride: boolean;
	    overrideJson: string;
	
	    static createFrom(source: any = {}) {
	        return new NumberItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.projectId = source["projectId"];
	        this.itemIndex = source["itemIndex"];
	        this.numberValue = source["numberValue"];
	        this.x = source["x"];
	        this.y = source["y"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.rotation = source["rotation"];
	        this.fontFamily = source["fontFamily"];
	        this.fontSize = source["fontSize"];
	        this.fontStyle = source["fontStyle"];
	        this.fontColor = source["fontColor"];
	        this.letterSpacing = source["letterSpacing"];
	        this.alignment = source["alignment"];
	        this.isVisible = source["isVisible"];
	        this.isLocked = source["isLocked"];
	        this.isOverride = source["isOverride"];
	        this.overrideJson = source["overrideJson"];
	    }
	}
	export class NumberSettings {
	    id: string;
	    projectId: string;
	    mode: string;
	    startNumber: number;
	    endNumber: number;
	    step: number;
	    padding: number;
	    prefix: string;
	    suffix: string;
	    customSequence: string;
	    arrangement: string;
	    layerGroupsJson: string;
	    patternGroupsJson: string;
	    patternDefinitionsJson: string;
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    updatedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new NumberSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.projectId = source["projectId"];
	        this.mode = source["mode"];
	        this.startNumber = source["startNumber"];
	        this.endNumber = source["endNumber"];
	        this.step = source["step"];
	        this.padding = source["padding"];
	        this.prefix = source["prefix"];
	        this.suffix = source["suffix"];
	        this.customSequence = source["customSequence"];
	        this.arrangement = source["arrangement"];
	        this.layerGroupsJson = source["layerGroupsJson"];
	        this.patternGroupsJson = source["patternGroupsJson"];
	        this.patternDefinitionsJson = source["patternDefinitionsJson"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PrintSettings {
	    id: string;
	    projectId: string;
	    printerName: string;
	    pageRangeStart: number;
	    pageRangeEnd: number;
	    copies: number;
	    // Go type: time
	    lastPrintedAt?: any;
	
	    static createFrom(source: any = {}) {
	        return new PrintSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.projectId = source["projectId"];
	        this.printerName = source["printerName"];
	        this.pageRangeStart = source["pageRangeStart"];
	        this.pageRangeEnd = source["pageRangeEnd"];
	        this.copies = source["copies"];
	        this.lastPrintedAt = this.convertValues(source["lastPrintedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Project {
	    id: string;
	    name: string;
	    description: string;
	    type: string;
	    imagePath: string;
	    thumbnailPath: string;
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    updatedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new Project(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.type = source["type"];
	        this.imagePath = source["imagePath"];
	        this.thumbnailPath = source["thumbnailPath"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SheetSettings {
	    id: string;
	    projectId: string;
	    paperSize: string;
	    paperWidth: number;
	    paperHeight: number;
	    orientation: string;
	    rows: number;
	    columns: number;
	    hGap: number;
	    vGap: number;
	    marginTop: number;
	    marginBottom: number;
	    marginLeft: number;
	    marginRight: number;
	    rotation: number;
	
	    static createFrom(source: any = {}) {
	        return new SheetSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.projectId = source["projectId"];
	        this.paperSize = source["paperSize"];
	        this.paperWidth = source["paperWidth"];
	        this.paperHeight = source["paperHeight"];
	        this.orientation = source["orientation"];
	        this.rows = source["rows"];
	        this.columns = source["columns"];
	        this.hGap = source["hGap"];
	        this.vGap = source["vGap"];
	        this.marginTop = source["marginTop"];
	        this.marginBottom = source["marginBottom"];
	        this.marginLeft = source["marginLeft"];
	        this.marginRight = source["marginRight"];
	        this.rotation = source["rotation"];
	    }
	}
	export class ProjectFull {
	    project?: Project;
	    assets: Asset[];
	    numberSettings?: NumberSettings;
	    manualNumbers: ManualNumber[];
	    numberItems: NumberItem[];
	    sheetSettings?: SheetSettings;
	    cropBleedSettings?: CropBleedSettings;
	    printSettings?: PrintSettings;
	    layers: Layer[];
	
	    static createFrom(source: any = {}) {
	        return new ProjectFull(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.project = this.convertValues(source["project"], Project);
	        this.assets = this.convertValues(source["assets"], Asset);
	        this.numberSettings = this.convertValues(source["numberSettings"], NumberSettings);
	        this.manualNumbers = this.convertValues(source["manualNumbers"], ManualNumber);
	        this.numberItems = this.convertValues(source["numberItems"], NumberItem);
	        this.sheetSettings = this.convertValues(source["sheetSettings"], SheetSettings);
	        this.cropBleedSettings = this.convertValues(source["cropBleedSettings"], CropBleedSettings);
	        this.printSettings = this.convertValues(source["printSettings"], PrintSettings);
	        this.layers = this.convertValues(source["layers"], Layer);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SheetLayout {
	    itemsPerSheet: number;
	    totalSheets: number;
	    totalItems: number;
	    remainingItems: number;
	    itemWidth: number;
	    itemHeight: number;
	    printableWidth: number;
	    printableHeight: number;
	    positions: ItemPosition[];
	
	    static createFrom(source: any = {}) {
	        return new SheetLayout(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.itemsPerSheet = source["itemsPerSheet"];
	        this.totalSheets = source["totalSheets"];
	        this.totalItems = source["totalItems"];
	        this.remainingItems = source["remainingItems"];
	        this.itemWidth = source["itemWidth"];
	        this.itemHeight = source["itemHeight"];
	        this.printableWidth = source["printableWidth"];
	        this.printableHeight = source["printableHeight"];
	        this.positions = this.convertValues(source["positions"], ItemPosition);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ValidationResult {
	    isValid: boolean;
	    totalItems: number;
	    validItems: number;
	    invalidItems: number;
	    duplicates: string[];
	    invalidValues: string[];
	    errors: string[];
	
	    static createFrom(source: any = {}) {
	        return new ValidationResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.isValid = source["isValid"];
	        this.totalItems = source["totalItems"];
	        this.validItems = source["validItems"];
	        this.invalidItems = source["invalidItems"];
	        this.duplicates = source["duplicates"];
	        this.invalidValues = source["invalidValues"];
	        this.errors = source["errors"];
	    }
	}

}

export namespace service {
	
	export class NumberingService {
	
	
	    static createFrom(source: any = {}) {
	        return new NumberingService(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	
	    }
	}
	export class ProjectService {
	
	
	    static createFrom(source: any = {}) {
	        return new ProjectService(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	
	    }
	}
	export class SheetService {
	
	
	    static createFrom(source: any = {}) {
	        return new SheetService(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	
	    }
	}
	export class StorageService {
	
	
	    static createFrom(source: any = {}) {
	        return new StorageService(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	
	    }
	}

}

