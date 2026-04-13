package auth

import (
	"database/sql"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"talent-hub/internal/db"
)

type PublicUser struct {
	ID         int    `json:"id"`
	Username   string `json:"username"`
	Email      string `json:"email"`
	Role       string `json:"role"`
	RealName   string `json:"realName"`
	EmployeeID *int   `json:"employeeId"`
	SuperAdmin bool   `json:"superAdmin"`
}

func ToPublicUser(u *db.LoginUser) *PublicUser {
	if u == nil {
		return nil
	}
	role := u.Role
	sa := u.SuperAdmin == 1
	if sa {
		role = "super_admin"
	}
	return &PublicUser{
		ID:         u.ID,
		Username:   u.Username,
		Email:      u.Email,
		Role:       role,
		RealName:   u.RealName,
		EmployeeID: u.EmployeeID,
		SuperAdmin: sa,
	}
}

func VerifyPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

type LoginResult struct {
	OK      bool
	Message string
	Token   string
	User    *PublicUser
}

func Authenticate(database *sql.DB, identifier, password, jwtSecret string) LoginResult {
	id := strings.TrimSpace(identifier)
	if id == "" {
		return LoginResult{Message: "请输入邮箱或用户名"}
	}

	user, _ := db.FindLoginUserByEmail(database, strings.ToLower(id))
	if user == nil && !strings.Contains(id, "@") {
		user, _ = db.FindLoginUserByUsername(database, strings.ToLower(id))
	}
	if user == nil || !VerifyPassword(user.PasswordHash, password) {
		return LoginResult{Message: "邮箱/用户名或密码错误"}
	}

	pub := ToPublicUser(user)
	token, err := GenerateToken(pub, jwtSecret)
	if err != nil {
		return LoginResult{Message: "生成令牌失败"}
	}
	return LoginResult{OK: true, Token: token, User: pub}
}

func GenerateToken(user *PublicUser, secret string) (string, error) {
	claims := jwt.MapClaims{
		"sub":   user.ID,
		"email": user.Email,
		"role":  user.Role,
		"sa":    user.SuperAdmin,
		"exp":   time.Now().Add(7 * 24 * time.Hour).Unix(),
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return t.SignedString([]byte(secret))
}

func ParseToken(tokenStr, secret string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})
	if err != nil || !token.Valid {
		return nil, err
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, jwt.ErrTokenMalformed
	}
	return claims, nil
}

func HasFullWorkspaceAccess(user *PublicUser) bool {
	if user == nil {
		return false
	}
	if user.SuperAdmin {
		return true
	}
	return user.Role == "hrbp" || user.Role == "super_admin"
}
