import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals'

function devConsoleSink(metric: Metric): void {
  console.debug('[web-vitals]', metric.name, Math.round(metric.value), metric.rating)
}

function noopSink(): void {
  // TODO(assignment 07): POST metrics to a backend observability endpoint
}

/** Wires Core Web Vitals reporting. Call once at app startup. */
export function reportWebVitals(): void {
  const sink = import.meta.env.DEV ? devConsoleSink : noopSink
  onCLS(sink)
  onINP(sink)
  onLCP(sink)
  onFCP(sink)
  onTTFB(sink)
}
