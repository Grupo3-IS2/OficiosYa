package com.um.uy.oficiosya.config;

import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Hibernate creates a CHECK constraint listing an enum column's values when it creates the table,
 * but ddl-auto=update never touches it again, so a value added to the enum later (like
 * RESCHEDULE_REQUESTED, or a verification code's PASSWORD_SETUP) would be refused by databases
 * created before it. This rebuilds those constraints on every startup.
 *
 * <p>The values are written out instead of read from the enums so the SQL stays a constant;
 * EnumCheckConstraintUpdaterTest fails if an enum gains a value missing here.
 */
@Component
public class EnumCheckConstraintUpdater implements CommandLineRunner {

    static final String STATUS_VALUES =
            "'PROPOSED', 'ACCEPTED', 'RESCHEDULE_REQUESTED', 'REJECTED', 'CANCELLED', 'COMPLETED'";
    static final String PAYMENT_STATE_VALUES = "'PENDING', 'RETAINED', 'PAID', 'REFUNDED'";
    static final String PURPOSE_VALUES = "'REGISTER', 'EMAIL_CHANGE', 'PASSWORD_SETUP', 'ACCOUNT_DELETION', 'PASSWORD_RESET'";

    private static final String EXPIRED_TO_CANCELLED =
            "UPDATE job_request SET status = 'CANCELLED' WHERE status = 'EXPIRED'";
    private static final String DROP_STATUS_CHECK =
            "ALTER TABLE job_request DROP CONSTRAINT IF EXISTS job_request_status_check";
    private static final String ADD_STATUS_CHECK =
            "ALTER TABLE job_request ADD CONSTRAINT job_request_status_check CHECK (status IN ("
                    + STATUS_VALUES + "))";
    private static final String DROP_PAYMENT_STATE_CHECK =
            "ALTER TABLE job_request DROP CONSTRAINT IF EXISTS job_request_payment_state_check";
    private static final String ADD_PAYMENT_STATE_CHECK =
            "ALTER TABLE job_request ADD CONSTRAINT job_request_payment_state_check CHECK (payment_state IN ("
                    + PAYMENT_STATE_VALUES + "))";
    private static final String DROP_PURPOSE_CHECK =
            "ALTER TABLE verification_codes DROP CONSTRAINT IF EXISTS verification_codes_purpose_check";
    private static final String ADD_PURPOSE_CHECK =
            "ALTER TABLE verification_codes ADD CONSTRAINT verification_codes_purpose_check CHECK (purpose IN ("
                    + PURPOSE_VALUES + "))";

    /** Nullable since a professional's proposal has no PIN until the client accepts it; update never drops a NOT NULL. */
    private static final String PIN_HASH_NULLABLE =
            "ALTER TABLE job_request ALTER COLUMN confirmation_pin_hash DROP NOT NULL";

    private final JdbcTemplate jdbcTemplate;

    public EnumCheckConstraintUpdater(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    @Transactional
    public void run(String... args) {
        jdbcTemplate.execute(DROP_STATUS_CHECK);
        jdbcTemplate.execute(EXPIRED_TO_CANCELLED);
        jdbcTemplate.execute(ADD_STATUS_CHECK);
        jdbcTemplate.execute(DROP_PAYMENT_STATE_CHECK);
        jdbcTemplate.execute(ADD_PAYMENT_STATE_CHECK);
        jdbcTemplate.execute(DROP_PURPOSE_CHECK);
        jdbcTemplate.execute(ADD_PURPOSE_CHECK);
        jdbcTemplate.execute(PIN_HASH_NULLABLE);
    }
}
