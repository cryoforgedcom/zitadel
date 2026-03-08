package risk

import "time"

type Outcome string

type SignalStream string

const (
	StreamRequest      SignalStream = "request"
	StreamAuth         SignalStream = "auth"
	StreamAccount      SignalStream = "account"
	StreamNotification SignalStream = "notification"
)

type Finding struct {
	Name       string
	Source     string
	Message    string
	Block      bool
	Confidence float64
}

type Decision struct {
	Allow    bool
	Findings []Finding
}

type Signal struct {
	InstanceID    string
	UserID        string
	// CallerID is the authenticated actor (user or service account).
	// Always set — even login/register flows use the login UI's service account.
	CallerID      string
	SessionID     string
	FingerprintID string
	Operation     string
	// Stream classifies the signal source for filtering and retention.
	Stream        SignalStream
	// Resource identifies the target of the operation (e.g. "users.list").
	Resource      string
	Outcome       Outcome
	Timestamp     time.Time
	IP            string
	UserAgent     string

	// HTTP-derived context (Tier 1 enrichment).
	AcceptLanguage string   // Accept-Language header value
	Country        string   // ISO 3166-1 alpha-2 from proxy/CDN header (e.g. CF-IPCountry)
	ForwardedChain []string // full X-Forwarded-For hop list
	Referer        string   // Referer header
	SecFetchSite   string   // Sec-Fetch-Site header (e.g. "same-origin", "cross-site")
	IsHTTPS        bool     // true if X-Forwarded-Proto is "https"
}

type RecordedSignal struct {
	Signal
	Findings []Finding
}

type Snapshot struct {
	UserSignals    []RecordedSignal
	SessionSignals []RecordedSignal
}

const (
	OutcomeSuccess Outcome = "success"
	OutcomeFailure Outcome = "failure"
	OutcomeBlocked    Outcome = "blocked"
	OutcomeChallenged Outcome = "challenged"

)

func (d Decision) BlockingFindings() []Finding {
	findings := make([]Finding, 0, len(d.Findings))
	for _, finding := range d.Findings {
		if finding.Block {
			findings = append(findings, finding)
		}
	}
	return findings
}
