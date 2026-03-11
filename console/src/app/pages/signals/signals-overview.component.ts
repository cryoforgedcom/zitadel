import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { GrpcService } from 'src/app/services/grpc.service';
import { ToastService } from 'src/app/services/toast.service';

import type { Signal, AggregationBucket } from '@zitadel/proto/zitadel/signal/v2/signal_pb.js';

interface TimeRange {
  label: string;
  value: string;
  bucket: string;
}

interface BreakdownRow {
  key: string;
  count: number;
  pct: number;
}

@Component({
  selector: 'cnsl-signals-overview',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './signals-overview.component.html',
  styleUrls: ['./signals.component.scss'],
})
export class SignalsOverviewComponent implements OnInit {
  private readonly grpc = inject(GrpcService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  // Chart
  chartBuckets: AggregationBucket[] = [];
  chartLoading = false;
  chartPath = '';
  chartMaxCount = 0;
  chartWidth = 960;
  chartHeight = 160;

  // Summary metrics
  streamCounts: AggregationBucket[] = [];
  outcomeCounts: AggregationBucket[] = [];
  streams: string[] = [];

  // Fixed panels
  topOperations: BreakdownRow[] = [];
  topUsers: BreakdownRow[] = [];
  topIPs: BreakdownRow[] = [];
  topCountries: BreakdownRow[] = [];
  recentFailures: Signal[] = [];

  timeRanges: TimeRange[] = [
    { label: 'Last 1h', value: '1 hour', bucket: '1 minute' },
    { label: 'Last 6h', value: '6 hours', bucket: '5 minutes' },
    { label: 'Last 24h', value: '24 hours', bucket: '30 minutes' },
    { label: 'Last 7d', value: '7 days', bucket: '3 hours' },
    { label: 'Last 30d', value: '30 days', bucket: '12 hours' },
  ];
  selectedTimeRange: TimeRange = this.timeRanges[2];

  // Store health
  storeHealthLoading = false;
  ingestRate5m = 0;
  ingestRate1h = 0;
  storageByStream: { stream: string; count: number; pct: number }[] = [];

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loadChart();
    this.loadDimensions();
    this.loadTopOperations();
    this.loadTopUsers();
    this.loadTopIPs();
    this.loadTopCountries();
    this.loadRecentFailures();
    this.loadStoreHealth();
  }

  selectTimeRange(range: TimeRange): void {
    this.selectedTimeRange = range;
    this.refresh();
  }

  drillDown(field: string, value: string): void {
    const params: Record<string, string> = {};
    if (value) params[field] = value;
    this.router.navigate(['/signals/logs'], { queryParams: params });
  }

  viewUserActivity(userId: string): void {
    this.router.navigate(['/signals/activity'], { queryParams: { user_id: userId } });
  }

  loadChart(): void {
    if (!this.grpc.signal) return;
    this.chartLoading = true;
    this.grpc.signal
      .aggregateSignals({
        filters: {},
        groupBy: 'time_bucket',
        metric: 'count',
        timeBucket: this.selectedTimeRange.bucket,
      })
      .then(
        (resp) => {
          this.chartBuckets = resp.buckets ?? [];
          this.buildChartPath();
          this.chartLoading = false;
        },
        (err) => {
          this.toast.showError(err);
          this.chartLoading = false;
        },
      );
  }

  loadDimensions(): void {
    if (!this.grpc.signal) return;
    this.grpc.signal
      .aggregateSignals({ filters: {}, groupBy: 'stream', metric: 'count', timeBucket: '' })
      .then((resp) => {
        this.streamCounts = resp.buckets ?? [];
        this.streams = this.streamCounts.map((b) => b.key).filter((k) => k);
      });
    this.grpc.signal
      .aggregateSignals({ filters: {}, groupBy: 'outcome', metric: 'count', timeBucket: '' })
      .then((resp) => {
        this.outcomeCounts = resp.buckets ?? [];
      });
  }

  loadTopOperations(): void {
    if (!this.grpc.signal) return;
    this.grpc.signal
      .aggregateSignals({ filters: {}, groupBy: 'operation', metric: 'count', timeBucket: '' })
      .then((resp) => {
        const buckets = resp.buckets ?? [];
        const total = buckets.reduce((s, b) => s + Number(b.count), 0) || 1;
        this.topOperations = buckets
          .filter((b) => b.key)
          .slice(0, 10)
          .map((b) => ({ key: b.key, count: Number(b.count), pct: (Number(b.count) / total) * 100 }));
      });
  }

  loadTopUsers(): void {
    if (!this.grpc.signal) return;
    this.grpc.signal
      .aggregateSignals({ filters: {}, groupBy: 'user_id', metric: 'count', timeBucket: '' })
      .then((resp) => {
        const buckets = resp.buckets ?? [];
        const total = buckets.reduce((s, b) => s + Number(b.count), 0) || 1;
        this.topUsers = buckets
          .filter((b) => b.key)
          .slice(0, 10)
          .map((b) => ({ key: b.key, count: Number(b.count), pct: (Number(b.count) / total) * 100 }));
      });
  }

  loadTopIPs(): void {
    if (!this.grpc.signal) return;
    this.grpc.signal
      .aggregateSignals({ filters: {}, groupBy: 'ip', metric: 'count', timeBucket: '' })
      .then((resp) => {
        const buckets = resp.buckets ?? [];
        const total = buckets.reduce((s, b) => s + Number(b.count), 0) || 1;
        this.topIPs = buckets
          .filter((b) => b.key)
          .slice(0, 10)
          .map((b) => ({ key: b.key, count: Number(b.count), pct: (Number(b.count) / total) * 100 }));
      });
  }

  loadTopCountries(): void {
    if (!this.grpc.signal) return;
    this.grpc.signal
      .aggregateSignals({ filters: {}, groupBy: 'country', metric: 'count', timeBucket: '' })
      .then((resp) => {
        const buckets = resp.buckets ?? [];
        const total = buckets.reduce((s, b) => s + Number(b.count), 0) || 1;
        this.topCountries = buckets
          .filter((b) => b.key)
          .slice(0, 10)
          .map((b) => ({ key: b.key, count: Number(b.count), pct: (Number(b.count) / total) * 100 }));
      });
  }

  loadRecentFailures(): void {
    if (!this.grpc.signal) return;
    this.grpc.signal
      .listSignals({
        query: { offset: BigInt(0), limit: 5, asc: false },
        filters: { outcome: 'failure' },
      })
      .then((resp) => {
        this.recentFailures = resp.signals ?? [];
      });
  }

  buildChartPath(): void {
    if (this.chartBuckets.length === 0) {
      this.chartPath = '';
      this.chartMaxCount = 0;
      return;
    }
    this.chartMaxCount = Math.max(...this.chartBuckets.map((b) => Number(b.count)), 1);
    const padding = 8;
    const w = this.chartWidth - padding * 2;
    const h = this.chartHeight - padding * 2;
    const step = w / Math.max(this.chartBuckets.length - 1, 1);
    const points = this.chartBuckets.map((b, i) => {
      const x = padding + i * step;
      const y = padding + h - (Number(b.count) / this.chartMaxCount) * h;
      return `${x},${y}`;
    });
    this.chartPath = 'M' + points.join(' L');
  }

  getChartFillPath(): string {
    if (!this.chartPath) return '';
    const padding = 8;
    const h = this.chartHeight - padding;
    return this.chartPath + ` L${this.chartWidth - padding},${h} L${padding},${h} Z`;
  }

  get metricTotal(): number {
    return this.streamCounts.reduce((s, b) => s + Number(b.count), 0);
  }

  get successRate(): string {
    const total = this.metricTotal;
    if (total === 0) return '0';
    const success = this.getDimensionCount(this.outcomeCounts, 'success');
    return ((success / total) * 100).toFixed(1);
  }

  getDimensionCount(buckets: AggregationBucket[], key: string): number {
    return Number(buckets.find((b) => b.key === key)?.count ?? 0);
  }

  toMillis(ts: any): number | null {
    if (!ts?.seconds) return null;
    return Number(ts.seconds) * 1000;
  }

  trackByKey(_i: number, row: BreakdownRow): string {
    return row.key;
  }

  shortName(name: string): string {
    if (!name) return '';
    const slashParts = name.split('/');
    if (slashParts.length >= 3) return slashParts[slashParts.length - 1];
    const dotParts = name.split('.');
    if (dotParts.length > 3) return dotParts.slice(-3).join('.');
    return name;
  }

  loadStoreHealth(): void {
    if (!this.grpc.signal) return;
    this.storeHealthLoading = true;

    const streamReq = this.grpc.signal.aggregateSignals({
      filters: {},
      groupBy: 'stream',
      metric: 'count',
      timeBucket: '',
    });

    const now = new Date();
    const fiveMinAgo = timestampFromDate(new Date(now.getTime() - 5 * 60 * 1000));
    const oneHourAgo = timestampFromDate(new Date(now.getTime() - 60 * 60 * 1000));

    const rate5mReq = this.grpc.signal.aggregateSignals({
      filters: { after: fiveMinAgo },
      groupBy: 'stream',
      metric: 'count',
      timeBucket: '',
    });

    const rate1hReq = this.grpc.signal.aggregateSignals({
      filters: { after: oneHourAgo },
      groupBy: 'stream',
      metric: 'count',
      timeBucket: '',
    });

    Promise.all([streamReq, rate5mReq, rate1hReq]).then(
      ([streamResp, rate5mResp, rate1hResp]) => {
        const buckets = streamResp.buckets ?? [];
        const total = buckets.reduce((s, b) => s + Number(b.count), 0) || 1;
        this.storageByStream = buckets
          .filter((b) => b.key)
          .map((b) => ({
            stream: b.key,
            count: Number(b.count),
            pct: (Number(b.count) / total) * 100,
          }));

        const sum5m = (rate5mResp.buckets ?? []).reduce((s, b) => s + Number(b.count), 0);
        this.ingestRate5m = Math.round(sum5m / 5);

        const sum1h = (rate1hResp.buckets ?? []).reduce((s, b) => s + Number(b.count), 0);
        this.ingestRate1h = Math.round(sum1h / 60);

        this.storeHealthLoading = false;
      },
      () => {
        this.storeHealthLoading = false;
      },
    );
  }
}
