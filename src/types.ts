// src/types.ts
export interface HealthLog {
  id?: string;
  date: string;
  food: string;
  calories: number;
  weight: number;
  type: 'food' | 'weight';
  sortOrder: number;
}