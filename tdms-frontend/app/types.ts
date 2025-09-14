export type Dataset = { id: number; filename: string };
export type Channel = {
  id: number;
  dataset_id: number;
  group_name: string;
  channel_name: string;
  n_rows: number;
  parquet_path: string;
  has_time: boolean;
  unit: string | null;
};
export type WindowResp = {
  x: (string|number)[];
  y: number[];
  unit: string | null;
  has_time: boolean;
};
