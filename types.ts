export interface Repo {
  name: string;
  url: string;
  description: string;
  starsTrend: string; // e.g., "+500 stars/day"
  tags: string[];
}

export type TimeFrame = '3d' | '7d' | '14d';

export interface ScanResult {
  repos: Repo[];
  timestamp: string;
  scanTimeTaken: string;
}

export enum AppStatus {
  IDLE = 'IDLE',
  SCANNING = 'SCANNING',
  ANALYZING = 'ANALYZING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}
