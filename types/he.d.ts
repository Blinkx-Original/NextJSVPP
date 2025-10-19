declare module 'he' {
  export function decode(value: string, options?: unknown): string;
  export function encode(value: string, options?: unknown): string;
  export function escape(value: string, options?: unknown): string;
  export function unescape(value: string, options?: unknown): string;

  const he: {
    decode(value: string, options?: unknown): string;
    encode(value: string, options?: unknown): string;
    escape(value: string, options?: unknown): string;
    unescape(value: string, options?: unknown): string;
  };

  export default he;
}
