// src/types.ts
export interface HealthLog {
  id?: string;
  date: string;
  food: string;
  calories: number;
  type: 'food' | 'weight';
  weight: number;
  sortOrder: number;
}

export interface PresetItem {
  name: string;
  calories: number;
}

export interface PresetCategory {
  category: string;
  items: PresetItem[];
}