package v2

import (
	"strings"

	"github.com/zitadel/zitadel/backend/v3/domain"
	"github.com/zitadel/zitadel/pkg/grpc/session/v2"
)

type sessionCommand interface {
	domain.CheckSessionUserParent
	domain.CheckSessionPasswordParent
}

func checksToCommands[P sessionCommand](parent P, checks *session.Checks) []domain.Commander {
	cmds := make([]domain.Commander, 0, 8)
	if checks.GetUser() != nil {
		cmds = append(cmds, userCheckToCommand(parent, checks.GetUser()))
	}
	if checks.GetPassword() != nil {
		cmds = append(cmds, passwordCheckToCommand(parent, checks.GetPassword()))
	}
	return cmds
}

func userCheckToCommand[P sessionCommand](parent P, check *session.CheckUser) domain.Commander {
	var userID, loginName *string
	switch t := check.GetSearch().(type) {
	case *session.CheckUser_UserId:
		if trimmed := strings.TrimSpace(t.UserId); trimmed != "" {
			userID = &trimmed
		}
	case *session.CheckUser_LoginName:
		if trimmed := strings.TrimSpace(t.LoginName); trimmed != "" {
			loginName = &trimmed
		}
	}
	return domain.NewCheckSessionUserCommand(parent, userID, loginName)
}

func passwordCheckToCommand[P sessionCommand](parent P, check *session.CheckPassword) domain.Commander {
	return domain.NewCheckSessionPasswordCommand(parent, check.GetPassword())
}
