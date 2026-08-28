package com.um.uy.oficiosya.service;

import com.um.uy.oficiosya.entity.User;
import com.um.uy.oficiosya.service.interfaces.JwtService;
import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.SignatureException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Paths;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

@Service
public class JwtServiceImpl implements JwtService {
    private static final Logger logger = LoggerFactory.getLogger(JwtServiceImpl.class);
    private final PrivateKey privateKey;
    private final PublicKey publicKey;
    @Value("${security.jwt.expiration-time}")
    private long jwtExpiration;

    public JwtServiceImpl(
            @Value("${security.jwt.private-key-path}") String privateKeyPath,
            @Value("${security.jwt.public-key-path}") String publicKeyPath) {
        if (Files.exists(Paths.get(privateKeyPath)) && Files.exists(Paths.get(publicKeyPath))) {
            this.privateKey = this.loadPrivateKey(privateKeyPath);
            this.publicKey = this.loadPublicKey(publicKeyPath);
        } else {
            logger.warn("JWT key pair not found ({} / {}), generating a temporary one for this run", privateKeyPath, publicKeyPath);
            KeyPair keyPair = this.generateKeyPair();
            this.privateKey = keyPair.getPrivate();
            this.publicKey = keyPair.getPublic();
        }
    }

    @Override
    public String extractUsername(String token) {
        return this.extractClaim(token, Claims::getSubject);
    }

    @Override
    public <T> T extractClaim(String token, Function<Claims, T> claimsResolver) {
        Claims claims = this.extractAllClaims(token);
        return claimsResolver.apply(claims);
    }

    @Override
    public String generateToken(User user) {
        return this.generateToken(new HashMap<>(), user.getEmail());
    }

    @Override
    public String generateToken(Map<String, Object> extraClaims, String id) {
        return this.buildToken(extraClaims, id, this.jwtExpiration);
    }

    @Override
    public long getExpirationTime() {
        return this.jwtExpiration;
    }

    @Override
    public boolean isTokenValid(String token, UserDetails userDetails) {
        try {
            String username = this.extractUsername(token);
            return username.equals(userDetails.getUsername()) && !this.isTokenExpired(token);
        } catch (JwtException e) {
            logger.warn("Token expired during validation {}", e.getMessage());
            return false;
        }
    }

    @Override
    public boolean isTokenExpired(String token) {
        try {
            Date expiration = this.extractExpiration(token);
            return expiration == null || expiration.before(new Date());
        } catch (ExpiredJwtException var3) {
            return true;
        } catch (Exception e) {
            logger.error("Error while token verification {}", e.getMessage());
            return true;
        }
    }

    @Override
    public Date extractExpiration(String token) {
        try {
            return this.extractClaim(token, Claims::getExpiration);
        } catch (ExpiredJwtException e) {
            return e.getClaims().getExpiration();
        } catch (Exception e) {
            logger.error("Error extracting expiration date {}", e.getMessage());
            return null;
        }
    }

    @Override
    public Date extractEmisionDate(String token) {
        try {
            return this.extractClaim(token, Claims::getIssuedAt);
        } catch (ExpiredJwtException e) {
            return e.getClaims().getIssuedAt();
        } catch (Exception e) {
            logger.error("Error extracting emission date {}", e.getMessage());
            return null;
        }
    }

    private String buildToken(Map<String, Object> extraClaims, String id, long expiration) {
        return Jwts.builder()
                .setClaims(extraClaims)
                .setSubject(id)
                .setIssuedAt(new Date(System.currentTimeMillis()))
                .setExpiration(new Date(System.currentTimeMillis() + expiration))
                .signWith(this.privateKey, SignatureAlgorithm.RS256)
                .compact();
    }

    private Claims extractAllClaims(String token) {
        try {
            return Jwts.parserBuilder()
                    .setSigningKey(this.publicKey).build()
                    .parseClaimsJws(token)
                    .getBody();
        } catch (ExpiredJwtException e) {
            logger.error("expired JWT token: {}", e.getMessage());
            throw e;
        } catch (MalformedJwtException e) {
            logger.error("malformed JWT token: {}", e.getMessage());
            throw e;
        } catch (SignatureException e) {
            logger.error("invalid JWT signature: {}", e.getMessage());
            throw e;
        } catch (JwtException e) {
            logger.error("invalid JWT token: {}", e.getMessage());
            throw e;
        }
    }

    private KeyPair generateKeyPair() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            return generator.generateKeyPair();
        } catch (Exception e) {
            throw new IllegalStateException("Error generating temporary key pair", e);
        }
    }

    private PrivateKey loadPrivateKey(String path) {
        try {
            String key = Files.readString(Paths.get(path))
                    .replace("-----BEGIN PRIVATE KEY-----", "")
                    .replace("-----END PRIVATE KEY-----", "")
                    .replaceAll("\\s", "");
            byte[] decoded = Decoders.BASE64.decode(key);
            PKCS8EncodedKeySpec spec = new PKCS8EncodedKeySpec(decoded);
            return KeyFactory.getInstance("RSA").generatePrivate(spec);
        } catch (Exception e) {
            throw new IllegalStateException("Error loading private key", e);
        }
    }

    private PublicKey loadPublicKey(String path) {
        try {
            String key = Files.readString(Paths.get(path))
                    .replace("-----BEGIN PUBLIC KEY-----", "")
                    .replace("-----END PUBLIC KEY-----", "")
                    .replaceAll("\\s", "");
            byte[] decoded = Decoders.BASE64.decode(key);
            X509EncodedKeySpec spec = new X509EncodedKeySpec(decoded);
            return KeyFactory.getInstance("RSA").generatePublic(spec);
        } catch (Exception e) {
            throw new IllegalStateException("Error loading public key", e);
        }
    }
}
