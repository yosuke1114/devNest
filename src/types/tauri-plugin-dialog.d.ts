declare module "@tauri-apps/plugin-dialog" {
  export interface OpenDialogOptions {
    directory?: boolean;
    multiple?: boolean;
    title?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }
  export function open(options?: OpenDialogOptions): Promise<string | string[] | null>;
  export function save(options?: object): Promise<string | null>;
}
