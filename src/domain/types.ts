export interface HealthRecord {
  schemaVersion: 1;
  medications: Medication[];
  indicators: Indicator[];
  observations: Observation[];
  sources: Source[];
}

export interface Medication {
  id: string;
  nameZh: string;
  nameEn: string;
  strength: string;
  instructions: string;
  startDate: string | null;
  endDate: string | null;
  linkedIndicatorIds: string[];
}

export interface Indicator {
  id: string;
  nameZh: string;
  nameEn: string;
  purposeZh: string;
  purposeEn: string;
  category: string;
  unit: string;
  lowerLimit: number | null;
  upperLimit: number | null;
  priority: boolean;
}

export interface Observation {
  id: string;
  indicatorId: string;
  date: string;
  value: number;
  unit: string;
  sourceId: string | null;
  confirmed: true;
}

export interface Source {
  id: string;
  fileName: string;
  type: 'image' | 'pdf' | 'manual';
  importedAt: string;
  pageCount: number | null;
}
