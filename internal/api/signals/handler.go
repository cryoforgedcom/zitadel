// Package signals provides a lightweight HTTP/JSON API for querying
// signal data from the DuckLake store. This is a POC-level API that
// bypasses the full proto generation pipeline.
package signals

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/mux"

	"github.com/zitadel/zitadel/internal/api/authz"
	http_mw "github.com/zitadel/zitadel/internal/api/http/middleware"
	sig "github.com/zitadel/zitadel/internal/signals"
)

// Handler serves the Signals v2 HTTP/JSON API.
type Handler struct {
	store *sig.DuckLakeStore
}

// NewHandler creates a Signals API handler.
// Returns nil if the DuckLake store is not available.
func NewHandler(store *sig.DuckLakeStore) *Handler {
	if store == nil {
		return nil
	}
	return &Handler{store: store}
}

// RegisterRoutes mounts the signals API routes on the given router.
func (h *Handler) RegisterRoutes(router *mux.Router) {
	sub := router.PathPrefix("/v2/signals").Subrouter()
	sub.Use(http_mw.CORSInterceptor)
	sub.HandleFunc("/search", h.handleSearch).Methods("POST", "OPTIONS")
	sub.HandleFunc("/aggregate", h.handleAggregate).Methods("POST", "OPTIONS")
}

// SearchRequest is the JSON request body for POST /v2/signals/search.
type SearchRequest struct {
	InstanceID string   `json:"instance_id,omitempty"`
	UserID     string   `json:"user_id,omitempty"`
	SessionID  string   `json:"session_id,omitempty"`
	IP         string   `json:"ip,omitempty"`
	Operation  string   `json:"operation,omitempty"`
	Stream     string   `json:"stream,omitempty"`
	Outcome    string   `json:"outcome,omitempty"`
	Country    string   `json:"country,omitempty"`
	StartTime  string   `json:"start_time,omitempty"` // RFC3339
	EndTime    string   `json:"end_time,omitempty"`   // RFC3339
	Offset     int      `json:"offset"`
	Limit      int      `json:"limit"`
	Streams    []string `json:"streams,omitempty"`
}

// SearchResponse is returned from POST /v2/signals/search.
type SearchResponse struct {
	Signals    []SignalJSON `json:"signals"`
	TotalCount int64        `json:"total_count"`
	Offset     int          `json:"offset"`
	Limit      int          `json:"limit"`
}

// SignalJSON is a JSON-serializable signal record.
type SignalJSON struct {
	InstanceID     string   `json:"instance_id"`
	UserID         string   `json:"user_id,omitempty"`
	CallerID       string   `json:"caller_id,omitempty"`
	SessionID      string   `json:"session_id,omitempty"`
	FingerprintID  string   `json:"fingerprint_id,omitempty"`
	Operation      string   `json:"operation"`
	Stream         string   `json:"stream"`
	Resource       string   `json:"resource,omitempty"`
	Outcome        string   `json:"outcome"`
	CreatedAt      string   `json:"created_at"`
	IP             string   `json:"ip,omitempty"`
	UserAgent      string   `json:"user_agent,omitempty"`
	Country        string   `json:"country,omitempty"`
	AcceptLanguage string   `json:"accept_language,omitempty"`
	Findings       []string `json:"findings,omitempty"`
}

// AggregateRequest is the JSON request body for POST /v2/signals/aggregate.
type AggregateRequest struct {
	SearchRequest
	GroupBy    string `json:"group_by"`              // field name or "time_bucket"
	TimeBucket string `json:"time_bucket,omitempty"` // e.g. "1 hour", "1 day"
	Metric     string `json:"metric"`                // "count" or "distinct_count"
}

// AggregateResponse is returned from POST /v2/signals/aggregate.
type AggregateResponse struct {
	Buckets []BucketJSON `json:"buckets"`
}

// BucketJSON is a JSON-serializable aggregation bucket.
type BucketJSON struct {
	Key   string `json:"key"`
	Count int64  `json:"count"`
}

func (h *Handler) handleSearch(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Use instance_id from auth context if not provided.
	if req.InstanceID == "" {
		req.InstanceID = authz.GetInstance(ctx).InstanceID()
	}

	filters := toSignalFilters(req)
	limit := req.Limit
	if limit <= 0 || limit > 1000 {
		limit = 100
	}

	signals, total, err := h.store.SearchSignals(ctx, filters, req.Offset, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := SearchResponse{
		Signals:    make([]SignalJSON, 0, len(signals)),
		TotalCount: total,
		Offset:     req.Offset,
		Limit:      limit,
	}
	for _, s := range signals {
		resp.Signals = append(resp.Signals, recordedSignalToJSON(s))
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) handleAggregate(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req AggregateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.InstanceID == "" {
		req.InstanceID = authz.GetInstance(ctx).InstanceID()
	}
	if req.GroupBy == "" {
		writeError(w, http.StatusBadRequest, "group_by is required")
		return
	}
	if req.Metric == "" {
		req.Metric = "count"
	}

	filters := toSignalFilters(req.SearchRequest)

	groupBy := sig.AggGroupByField
	if req.GroupBy == "time_bucket" {
		groupBy = sig.AggGroupByTimeBucket
	}
	metric := sig.AggMetricCount
	if req.Metric == "distinct_count" {
		metric = sig.AggMetricDistinctCount
	}

	aggReq := sig.AggregationRequest{
		GroupBy:            groupBy,
		FieldName:          req.GroupBy,
		TimeBucketInterval: req.TimeBucket,
		Metric:             metric,
	}

	buckets, err := h.store.AggregateSignals(ctx, filters, aggReq)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := AggregateResponse{
		Buckets: make([]BucketJSON, 0, len(buckets)),
	}
	for _, b := range buckets {
		resp.Buckets = append(resp.Buckets, BucketJSON{
			Key:   b.Key,
			Count: b.Value,
		})
	}

	writeJSON(w, http.StatusOK, resp)
}

func toSignalFilters(req SearchRequest) sig.SignalFilters {
	f := sig.SignalFilters{
		InstanceID: req.InstanceID,
		UserID:     req.UserID,
		SessionID:  req.SessionID,
		IP:         req.IP,
		Operation:  req.Operation,
		Stream:     req.Stream,
		Outcome:    req.Outcome,
		Country:    req.Country,
	}
	if req.StartTime != "" {
		if t, err := time.Parse(time.RFC3339, req.StartTime); err == nil {
			f.After = &t
		}
	}
	if req.EndTime != "" {
		if t, err := time.Parse(time.RFC3339, req.EndTime); err == nil {
			f.Before = &t
		}
	}
	return f
}

func recordedSignalToJSON(s sig.RecordedSignal) SignalJSON {
	findings := make([]string, 0, len(s.Findings))
	for _, f := range s.Findings {
		findings = append(findings, f.Name)
	}
	return SignalJSON{
		InstanceID:     s.InstanceID,
		UserID:         s.UserID,
		CallerID:       s.CallerID,
		SessionID:      s.SessionID,
		FingerprintID:  s.FingerprintID,
		Operation:      s.Operation,
		Stream:         string(s.Stream),
		Resource:       s.Resource,
		Outcome:        string(s.Outcome),
		CreatedAt:      s.Timestamp.Format(time.RFC3339),
		IP:             s.IP,
		UserAgent:      s.UserAgent,
		Country:        s.Country,
		AcceptLanguage: s.AcceptLanguage,
		Findings:       findings,
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// FormatInt64 formats an int64 as a string for display.
func FormatInt64(n int64) string {
	return strconv.FormatInt(n, 10)
}
