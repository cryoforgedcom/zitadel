import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit } from '@angular/core';
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
import { HttpClient } from '@angular/common/http';
import { GrpcAuthService } from 'src/app/services/grpc-auth.service';
import { ToastService } from 'src/app/services/toast.service';

interface SignalRecord {
  instance_id: string;
  user_id: string;
  session_id: string;
  operation: string;
  stream: string;
  outcome: string;
  created_at: string;
  ip: string;
  user_agent: string;
  country: string;
  findings: string[];
}

interface SearchResponse {
  signals: SignalRecord[];
  total_count: number;
  offset: number;
  limit: number;
}

interface AggBucket {
  key: string;
  count: number;
}

interface AggregateResponse {
  buckets: AggBucket[];
}

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
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  loading = false;
  signals: SignalRecord[] = [];
  totalCount = 0;
  offset = 0;
  limit = 50;

  // Aggregation
  aggBuckets: AggBucket[] = [];
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

  displayedColumns = ['created_at', 'stream', 'operation', 'outcome', 'ip', 'country', 'user_id', 'findings'];

  streams = ['request', 'auth', 'account', 'notification'];
  outcomes = ['success', 'failure', 'blocked', 'challenged'];
  groupByOptions = ['stream', 'outcome', 'operation', 'ip', 'country', 'time_bucket'];
  metrics = ['count', 'distinct_count'];

  ngOnInit(): void {
    this.search();
  }

  search(): void {
    this.loading = true;
    const filters = this.filterForm.value;
    const body: any = {
      offset: this.offset,
      limit: this.limit,
    };
    if (filters.stream) body.stream = filters.stream;
    if (filters.outcome) body.outcome = filters.outcome;
    if (filters.operation) body.operation = filters.operation;
    if (filters.ip) body.ip = filters.ip;
    if (filters.country) body.country = filters.country;
    if (filters.user_id) body.user_id = filters.user_id;

    this.http.post<SearchResponse>('/v2/signals/search', body).subscribe({
      next: (resp) => {
        this.signals = resp.signals || [];
        this.totalCount = resp.total_count;
        this.loading = false;
      },
      error: (err) => {
        this.toast.showError(err);
        this.loading = false;
      },
    });
  }

  aggregate(): void {
    this.aggLoading = true;
    const filters = this.filterForm.value;
    const agg = this.aggForm.value;
    const body: any = {
      group_by: agg.group_by,
      metric: agg.metric,
    };
    if (agg.group_by === 'time_bucket') {
      body.time_bucket = agg.time_bucket || '1 hour';
    }
    if (filters.stream) body.stream = filters.stream;
    if (filters.outcome) body.outcome = filters.outcome;

    this.http.post<AggregateResponse>('/v2/signals/aggregate', body).subscribe({
      next: (resp) => {
        this.aggBuckets = resp.buckets || [];
        this.aggLoading = false;
      },
      error: (err) => {
        this.toast.showError(err);
        this.aggLoading = false;
      },
    });
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
