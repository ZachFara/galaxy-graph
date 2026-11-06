export interface GNode {
  id: string;
  name: string;
  val: number;
  folder: string;
  folderName: string;
  filePath: string;
  degree: number;
  outDegree: number;
  inDegree: number;
  x?: number;
  y?: number;
  z?: number;
  tags?: string[];
  activityHeat?: number;
}

export interface GLink {
  source: string | GNode;
  target: string | GNode;
}

export function resolveId(endpoint: string | GNode): string {
  return typeof endpoint === "string" ? endpoint : endpoint.id;
}
