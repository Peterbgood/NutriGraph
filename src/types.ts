// src/types.ts
export interface HealthLog {
  id?: string;
  date: string;
  food: string;
  calories: number;
  protein?: number;
  type: 'food' | 'weight';
  weight: number;
  sortOrder: number;
  count?: number;
}

export interface PresetItem {
  name: string;
  calories: number;
  protein?: number;
}

export interface PresetCategory {
  category: string;
  items: PresetItem[];
}