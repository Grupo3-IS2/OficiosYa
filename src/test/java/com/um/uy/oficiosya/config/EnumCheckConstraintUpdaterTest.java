package com.um.uy.oficiosya.config;

import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.entity.PaymentState;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Arrays;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/** The CHECK constraints are written by hand, so they have to keep up with the enums. */
class EnumCheckConstraintUpdaterTest {

    private static String sqlList(Class<? extends Enum<?>> values) {
        return Arrays.stream(values.getEnumConstants())
                .map(value -> "'" + value.name() + "'")
                .collect(Collectors.joining(", "));
    }

    @Test
    void statusConstraint_listsEveryJobStatus() {
        assertEquals(sqlList(JobStatus.class), EnumCheckConstraintUpdater.STATUS_VALUES);
    }

    @Test
    void paymentStateConstraint_listsEveryPaymentState() {
        assertEquals(sqlList(PaymentState.class), EnumCheckConstraintUpdater.PAYMENT_STATE_VALUES);
    }

    @Test
    void run_dropsAndRecreatesBothConstraints() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);

        new EnumCheckConstraintUpdater(jdbcTemplate).run();

        verify(jdbcTemplate, times(4)).execute(anyString());
    }
}
