package signal

import (
	"context"
	"strings"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	sig "github.com/zitadel/zitadel/internal/signals"
	objectpb "github.com/zitadel/zitadel/pkg/grpc/object/v2"
	signalpb "github.com/zitadel/zitadel/pkg/grpc/signal/v1"
)

func (s *Server) SearchSignals(
	ctx context.Context,
	req *connect.Request[signalpb.SearchSignalsRequest],
) (*connect.Response[signalpb.SearchSignalsResponse], error) {
	offset := 0
	limit := 100
	if q := req.Msg.GetQuery(); q != nil {
		offset = int(q.GetOffset())
		if q.GetLimit() > 0 && int(q.GetLimit()) < 1000 {
			limit = int(q.GetLimit())
		}
	}

	filters := toSignalFilters(req.Msg.GetFilters())
	signals, total, err := s.store.SearchSignals(ctx, filters, offset, limit)
	if err != nil {
		return nil, err
	}

	resp := &signalpb.SearchSignalsResponse{
		Details: &objectpb.ListDetails{
			TotalResult: uint64(total),
		},
		Signals: make([]*signalpb.Signal, 0, len(signals)),
	}
	for _, s := range signals {
		resp.Signals = append(resp.Signals, recordedSignalToProto(s))
	}
	return connect.NewResponse(resp), nil
}

func (s *Server) AggregateSignals(
	ctx context.Context,
	req *connect.Request[signalpb.AggregateSignalsRequest],
) (*connect.Response[signalpb.AggregateSignalsResponse], error) {
	filters := toSignalFilters(req.Msg.GetFilters())

	groupBy := sig.AggGroupByField
	if req.Msg.GetGroupBy() == "time_bucket" {
		groupBy = sig.AggGroupByTimeBucket
	}
	metric := sig.AggMetricCount
	if req.Msg.GetMetric() == "distinct_count" {
		metric = sig.AggMetricDistinctCount
	}

	aggReq := sig.AggregationRequest{
		GroupBy:            groupBy,
		FieldName:          req.Msg.GetGroupBy(),
		TimeBucketInterval: req.Msg.GetTimeBucket(),
		Metric:             metric,
	}

	buckets, err := s.store.AggregateSignals(ctx, filters, aggReq)
	if err != nil {
		return nil, err
	}

	resp := &signalpb.AggregateSignalsResponse{
		Buckets: make([]*signalpb.AggregationBucket, 0, len(buckets)),
	}
	for _, b := range buckets {
		resp.Buckets = append(resp.Buckets, &signalpb.AggregationBucket{
			Key:   b.Key,
			Count: b.Value,
		})
	}
	return connect.NewResponse(resp), nil
}

func toSignalFilters(f *signalpb.SignalFilters) sig.SignalFilters {
	if f == nil {
		return sig.SignalFilters{}
	}
	sf := sig.SignalFilters{
		InstanceID: f.GetInstanceId(),
		UserID:     f.GetUserId(),
		SessionID:  f.GetSessionId(),
		IP:         f.GetIp(),
		Stream:     f.GetStream(),
		Outcome:    f.GetOutcome(),
		Operation:  f.GetOperation(),
		Country:    f.GetCountry(),
	}
	if ts := f.GetAfter(); ts != nil {
		t := ts.AsTime()
		sf.After = &t
	}
	if ts := f.GetBefore(); ts != nil {
		t := ts.AsTime()
		sf.Before = &t
	}
	return sf
}

func recordedSignalToProto(rs sig.RecordedSignal) *signalpb.Signal {
	findings := make([]string, 0, len(rs.Findings))
	for _, f := range rs.Findings {
		findings = append(findings, f.Name)
	}
	return &signalpb.Signal{
		InstanceId:     rs.InstanceID,
		UserId:         rs.UserID,
		CallerId:       rs.CallerID,
		SessionId:      rs.SessionID,
		FingerprintId:  rs.FingerprintID,
		Operation:      rs.Operation,
		Stream:         string(rs.Stream),
		Resource:       rs.Resource,
		Outcome:        string(rs.Outcome),
		CreatedAt:      timestamppb.New(rs.Timestamp),
		Ip:             rs.IP,
		UserAgent:      rs.UserAgent,
		AcceptLanguage: rs.AcceptLanguage,
		Country:        rs.Country,
		ForwardedChain: strings.Join(rs.ForwardedChain, ","),
		Referer:        rs.Referer,
		SecFetchSite:   rs.SecFetchSite,
		IsHttps:        rs.IsHTTPS,
		Findings:       findings,
	}
}

