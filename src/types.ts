export interface Template {
  id: string;
  name: string;
  file: File;
  tags: string[];
}

export interface CaseElements {
  parties: string;
  shareholders: string;
  focus: string;
  facts: string;
  evidence: string;
}
