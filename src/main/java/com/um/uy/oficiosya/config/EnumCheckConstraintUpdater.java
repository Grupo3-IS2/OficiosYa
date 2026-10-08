package com.um.uy.oficiosya.config;

import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Hibernate creates a CHECK constraint listing an enum column's values when it creates the table,
 * but ddl-auto=update never touches it again, so a value added to the enum later (like
 * RESCHEDULE_REQUESTED) would be refused by databases created before it. This rebuilds those
 * constraints on every startup.
 *
 * <p>The values are written out instead of read from the enums so the SQL stays a constant;
 * EnumCheckConstraintUpdaterTest fails if an enum gains a value missing here.
 */
@Component
public class EnumCheckConstraintUpdater implements CommandLineRunner {

    static final String STATUS_VALUES =
            "'PROPOSED', 'ACCEPTED', 'RESCHEDULE_REQUESTED', 'REJECTED', 'CANCELLED', 'COMPLETED'";
    static final String PAYMENT_STATE_VALUES = "'PENDING', 'RETAINED', 'PAID', 'REFUNDED'";

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

    private final JdbcTemplate jdbcTemplate;

    public EnumCheckConstraintUpdater(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    @Transactional
    public void run(String... args) {
        jdbcTemplate.execute(DROP_STATUS_CHECK);
        jdbcTemplate.execute(ADD_STATUS_CHECK);
        jdbcTemplate.execute(DROP_PAYMENT_STATE_CHECK);
        jdbcTemplate.execute(ADD_PAYMENT_STATE_CHECK);
    }
}
