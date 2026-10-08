package com.um.uy.oficiosya.config;

import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.PaymentState;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.stream.Collectors;

/**
 * Hibernate creates a CHECK constraint listing an enum column's values when it creates the table,
 * but ddl-auto=update never touches it again, so a value added to the enum later (like
 * RESCHEDULE_REQUESTED) would be refused by databases created before it. This rebuilds those
 * constraints from the current enums on every startup.
 */
@Component
public class EnumCheckConstraintUpdater implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;

    public EnumCheckConstraintUpdater(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    @Transactional
    public void run(String... args) {
        rebuild("job_request", "status", JobStatus.class);
        rebuild("job_request", "payment_state", PaymentState.class);
    }

    private void rebuild(String table, String column, Class<? extends Enum<?>> values) {
        String constraint = table + "_" + column + "_check";
        String allowed = Arrays.stream(values.getEnumConstants())
                .map(value -> "'" + value.name() + "'")
                .collect(Collectors.joining(", "));
        jdbcTemplate.execute("ALTER TABLE " + table + " DROP CONSTRAINT IF EXISTS " + constraint);
        jdbcTemplate.execute("ALTER TABLE " + table + " ADD CONSTRAINT " + constraint
                + " CHECK (" + column + " IN (" + allowed + "))");
    }
}
