# License API Server Security Guide

## Security Status

Your license server has been hardened with multiple security layers and is configured to work with **Cloudflare (HTTPS termination at Cloudflare, HTTP to backend)**. The server is designed to work seamlessly with existing clients while adding security protections.

## Current Security Measures ✅

### 1. **Rate Limiting**
- Prevents brute force attacks and DoS attempts
- Uses Cloudflare's `CF-Connecting-IP` header for accurate client IP tracking
- Limits requests per IP address per time window
- Different limits for different endpoints:
  - `/api/license/validate`: 200 requests/minute (higher for production use)
  - `/api/license/status`: 30 requests/minute
  - `/api/license/info`: 30 requests/minute
  - `/api/license/licenses`: 10 requests/minute (requires API key)
  - `/health`: 100 requests/minute

### 2. **API Key Authentication**
- Sensitive endpoints require API key:
  - `/api/license/licenses` - Lists all licenses
  - `/api/license/clients/<id>/licenses` - Client license data
- API key can be provided via (matches MSP API authentication style):
  - `Authorization: Bearer <token>` header (preferred - matches MSP API)
  - `X-API-Key: <key>` header
  - `?api_key=<key>` query parameter

### 3. **CORS Protection**
- **Cloudflare Mode (default)**: Allows all origins (Cloudflare handles CORS security)
- **Restricted Mode**: Set `CORS_ORIGINS` environment variable to restrict origins
- Works seamlessly with Cloudflare's proxy setup

### 4. **Security Headers**
- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-XSS-Protection: 1; mode=block` - XSS protection
- `Strict-Transport-Security` - Forces HTTPS (when using HTTPS)
- Server header obfuscated

### 5. **Input Validation**
- Required field validation
- Maximum length restrictions
- Input sanitization

### 6. **TLS Handshake Filtering**
- Silently ignores HTTPS connection attempts to HTTP server
- Reduces log noise from port scanners

## Security Concerns ⚠️

### 1. **HTTP vs HTTPS**
- **Current**: Server runs on HTTP behind Cloudflare (Cloudflare handles HTTPS)
- **Status**: ✅ Secure - Cloudflare terminates HTTPS and forwards HTTP to backend
- **Note**: This is a standard and secure setup. Cloudflare handles SSL/TLS encryption.

### 2. **Flask Development Server**
- **Current**: Using Flask's built-in development server
- **Risk**: Not designed for production, single-threaded, no process management
- **Recommendation**: Use production WSGI server (Gunicorn, uWSGI, Waitress)

### 3. **Exposed to Internet**
- **Current**: Running on `0.0.0.0` behind Cloudflare
- **Status**: ✅ Secure - Cloudflare acts as reverse proxy and firewall
- **Protection**: 
  - Cloudflare handles DDoS protection
  - Cloudflare provides WAF (Web Application Firewall)
  - Cloudflare filters malicious traffic
  - Backend only accessible through Cloudflare

### 4. **API Key Management**
- **Current**: Single API key stored in environment variable
- **Risk**: If compromised, all access is lost
- **Recommendation**: 
  - Use proper key rotation
  - Consider OAuth2 or JWT tokens
  - Store keys securely (not in code)

### 5. **Rate Limiting Storage**
- **Current**: In-memory storage (lost on restart)
- **Risk**: Doesn't work across multiple server instances
- **Recommendation**: Use Redis for distributed rate limiting

## Recommended Security Improvements

### Immediate Actions

1. **Set Environment Variables**
   ```bash
   # Generate a strong API key
   export LICENSE_API_KEY="your-strong-random-key-here"
   export LICENSE_SECRET_KEY="your-strong-secret-key-here"
   export CORS_ORIGINS="http://yourdomain.com,https://yourdomain.com"
   ```

2. **Use Firewall**
   - Block port 5001 from external access
   - Only allow specific IPs if needed
   - Use Windows Firewall or router firewall

3. **Disable Debug Mode**
   ```bash
   export FLASK_DEBUG=False
   ```

### Production Deployment

1. **Use HTTPS**
   - Get SSL certificate (Let's Encrypt is free)
   - Configure reverse proxy (nginx/Apache) with SSL
   - Redirect HTTP to HTTPS

2. **Use Production WSGI Server**
   ```bash
   # Install Gunicorn
   pip install gunicorn
   
   # Run with Gunicorn
   gunicorn -w 4 -b 0.0.0.0:5001 license_api_server:app
   ```

3. **Add Monitoring & Logging**
   - Monitor failed authentication attempts
   - Log all API access
   - Set up alerts for suspicious activity

4. **Database Security**
   - Use strong database passwords
   - Encrypt sensitive data at rest
   - Regular backups

5. **Network Security**
   - Use VPN for remote access
   - Implement IP whitelisting
   - Use private network when possible

## Configuration Examples

### Environment Variables
```bash
# Optional - for sensitive endpoints
LICENSE_API_KEY=your-secure-api-key-here
LICENSE_SECRET_KEY=your-secure-secret-key-here

# Cloudflare configuration (default: enabled)
BEHIND_CLOUDFLARE=true  # Set to false if not using Cloudflare

# Optional - customize security
CORS_ORIGINS=http://localhost,https://yourdomain.com  # Leave empty to allow all (Cloudflare mode)
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60
PORT=5001
FLASK_DEBUG=False
```

### Cloudflare Setup Notes
- **Default Configuration**: Works with Cloudflare out of the box
- **CORS**: Allows all origins by default (Cloudflare handles CORS)
- **IP Detection**: Uses `CF-Connecting-IP` header for accurate client IP
- **HTTPS**: Cloudflare handles SSL/TLS termination
- **Main Endpoints**: Remain open (no API key required) for existing clients:
  - `/api/license/validate` ✅ Open
  - `/api/license/status` ✅ Open
  - `/api/license/info` ✅ Open

### Using API Key
```bash
# Via Bearer token (matches MSP API style - preferred)
curl -H "Authorization: Bearer your-api-key" http://localhost:5001/api/license/licenses

# Via X-API-Key header
curl -H "X-API-Key: your-api-key" http://localhost:5001/api/license/licenses

# Via query parameter
curl "http://localhost:5001/api/license/licenses?api_key=your-api-key"
```

### Integration with MSP API
The license server uses the same Bearer token authentication style as your MSP API (`http://computerdynamicstt.com/api/msp`), making it easy to use the same authentication method across both systems.

## Monitoring Security

Watch for these indicators:
- Multiple 429 (Rate Limit) responses from same IP
- Multiple 401/403 (Authentication) failures
- Unusual request patterns
- High request volume from single IP
- TLS handshake attempts (normal, but indicates exposure)

## Conclusion

While the server now has basic security measures, **it's not fully secure for production internet exposure**. For production use:

1. ✅ Use HTTPS
2. ✅ Use production WSGI server
3. ✅ Restrict network access (firewall/VPN)
4. ✅ Set strong API keys
5. ✅ Monitor and log access
6. ✅ Regular security updates

The current setup is suitable for:
- Development/testing
- Internal network use
- Behind a reverse proxy with HTTPS

**Not suitable for:**
- Direct internet exposure without HTTPS
- Production without additional hardening
- Handling sensitive customer data without encryption

