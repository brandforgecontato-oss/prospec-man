export interface ExperimentVariant {
  key: string;
  label: string;
  /** 0-100, must sum to 100 across all variants of an experiment. */
  weight: number;
  isControl: boolean;
  /** Always keeps a floor of traffic testing a new hypothesis — prompt.MD "uma fatia sempre explorando hipótese nova". */
  isExploration?: boolean;
}
