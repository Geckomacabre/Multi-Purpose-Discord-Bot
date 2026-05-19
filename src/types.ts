export type QuestionOption = {
  label: string;
  value: string;
  description?: string;
};

export type ApplicationQuestion =
  | {
      custom_id: string;
      label: string;
      type: "short" | "paragraph";
      description?: string;
      placeholder?: string;
      required?: boolean;
    }
  | {
      custom_id: string;
      label: string;
      type: "checkbox";
      description?: string;
      options?: QuestionOption[];
      min?: number;
      max?: number;
      required?: boolean;
    }
  | {
      custom_id: string;
      label: string;
      type: "checkbox_group";
      options: QuestionOption[];
      min?: number;
      max?: number;
      required?: boolean;
      description?: string;
    };

export type ApplicationPosition = {
  custom_id: string;
  label: string;
  role_id: string;
  open: boolean;
  description: string;
  questions: ApplicationQuestion[];
};
