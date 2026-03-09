import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { TranslateModule } from '@ngx-translate/core';
import { CardModule } from '../../card/card.module';
import { GrpcService } from 'src/app/services/grpc.service';
import { ToastService } from 'src/app/services/toast.service';

import { Signal, SignalFilters, AggregationBucket } from 'src/app/proto/generated/zitadel/signal/v1/signal_pb';
import {
  SearchSignalsRequest,
  AggregateSignalsRequest,
} from 'src/app/proto/generated/zitadel/signal/v1/signal_service_pb';
import { ListQuery } from 'src/app/proto/generated/zitadel/object/v2/object_pb';

@Component({
  selector: 'cnsl-signals-explorer',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    CardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTableModule,
    MatInputModule,
    MatFormFieldModule,
  ],
  templateUrl: './signals-explorer.component.html',
  styleUrls: ['./signals-explorer.component.scss'],
})
export class SignalsExplorerComponent implements OnInit {
  private readonly grpc = inject(GrpcService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  loading = false;
  signals: Signal.AsObject[] = [];
  totalCount = 0;
  offset = 0;
  limit = 50;

  aggBuckets: AggregationBucket.AsObject[] = [];
  aggLoading = false;

  filterForm: FormGroup = this.fb.group({
    stream: [''],
    outcome: [''],
    operation: [''],
    ip: [''],
    country: [''],
    user_id: [''],
  });

  aggForm: FormGroup = this.fb.group({
    group_by: ['stream'],
    metric: ['count'],
    time_bucket: ['1 hour'],
  });

  displayedColumns = ['createdAt', 'stream', 'operation', 'outcome', 'ip', 'country', 'userId', 'findingsList'];

  streams = ['request', 'auth', 'account', 'notification'];
  outcomes = ['success', 'failure', 'blocked', 'challenged'];
  groupByOptions = ['stream', 'outcome', 'operation', 'ip', 'country', 'time_bucket'];
  metrics = ['count', 'distinct_count'];

  ngOnInit(): void {
    this.search();
  }

  search(): void {
    if (!this.grpc.signal) return;
    this.loading = true;
    const f = this.filterForm.value;

    const filters = new SignalFilters();
    if (f.stream) filters.setStream(f.stream);
    if (f.outcome) filters.setOutcome(f.outcome);
    if (f.operation) filters.setOperation(f.operation);
    if (f.ip) filters.setIp(f.ip);
    if (f.country) filters.setCountry(f.country);
    if (f.user_id) filters.setUserId(f.user_id);

    const query = new ListQuery();
    query.setOffset(this.offset);
    query.setLimit(this.limit);

    const req = new SearchSignalsRequest();
    req.setQuery(query);
    req.setFilters(filters);

    this.grpc.signal.searchSignals(req, null).then(
      (resp) => {
        this.signals = resp.getSignalsList().map((s) => s.toObject());
        this.totalCount = resp.getDetails()?.getTotalResult() ?? 0;
        this.loading = false;
      },
      (err) => {
        this.toast.showError(err);
        this.loading = false;
      },
    );
  }

  aggregate(): void {
    if (!this.grpc.signal) return;
    this.aggLoading = true;
    const f = this.filterForm.value;
    const agg = this.aggForm.value;

    const filters = new SignalFilters();
    if (f.stream) filters.setStream(f.stream);
    if (f.outcome) filters.setOutcome(f.outcome);

    const req = new AggregateSignalsRequest();
    req.setFilters(filters);
    req.setGroupBy(agg.group_by);
    req.setMetric(agg.metric);
    if (agg.group_by === 'time_bucket') {
      req.setTimeBucket(agg.time_bucket || '1 hour');
    }

    this.grpc.signal.aggregateSignals(req, null).then(
      (resp) => {
        this.aggBuckets = resp.getBucketsList().map((b) => b.toObject());
        this.aggLoading = false;
      },
      (err) => {
        this.toast.showError(err);
        this.aggLoading = false;
      },
    );
  }

  nextPage(): void {
    this.offset += this.limit;
    this.search();
  }

  prevPage(): void {
    this.offset = Math.max(0, this.offset - this.limit);
    this.search();
  }

  resetFilters(): void {
    this.filterForm.reset();
    this.offset = 0;
    this.search();
  }

  get hasNextPage(): boolean {
    return this.offset + this.limit < this.totalCount;
  }

  get hasPrevPage(): boolean {
    return this.offset > 0;
  }

  get currentPage(): number {
    return Math.floor(this.offset / this.limit) + 1;
  }

  get totalPages(): number {
    return Math.ceil(this.totalCount / this.limit) || 1;
  }
}
