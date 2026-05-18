declare module "@vercel/speed-insights/next" {
  interface SpeedInsightsProps {
    dsn?: string;
    sampleRate?: number;
    route?: string | null;
    debug?: boolean;
    scriptSrc?: string;
    endpoint?: string;
  }
  export function SpeedInsights(props: Omit<SpeedInsightsProps, "route">): null;
}
