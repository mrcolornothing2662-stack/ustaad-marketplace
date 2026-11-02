export interface DependencyProbe {
  name: string;
  check(): Promise<void>;
}
