// src/types.ts
export interface HealthLog {  // <--- Ensure 'export' is here
  id?: string;
  date: string;
  food: string;
  calories: number;
  type: 'food' | 'weight';
  weight: number;
  sortOrder: number;
}

export interface PresetCategory {
  category: string;
  icon: string;
  items: any[];
}