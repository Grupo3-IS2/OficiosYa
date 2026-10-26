package com.um.uy.oficiosya.mapper;

import com.um.uy.oficiosya.dto.request.ProfessionalCreateRequest;
import com.um.uy.oficiosya.dto.request.ServiceAreaRequest;
import com.um.uy.oficiosya.dto.response.ServiceAreaResponse;
import com.um.uy.oficiosya.entity.Professional;
import com.um.uy.oficiosya.entity.ServiceArea;
import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class ProfessionalMapperTest {

    private final ProfessionalMapper mapper = Mappers.getMapper(ProfessionalMapper.class);

    private static Professional withArea(ServiceArea area) {
        return Professional.builder().name("Beto Gómez").workingLocation("Pocitos").serviceArea(area).build();
    }

    @Test
    void theOwnerGetsTheExactCentre() {
        Professional professional = withArea(ServiceArea.builder().latitude(-34.912345).longitude(-56.156789).radiusKm(8).build());

        assertEquals(new ServiceAreaResponse(-34.912345, -56.156789, 8), mapper.toResponse(professional).getServiceArea());
    }

    @Test
    void thePublicGetsTheCentreRoundedToAboutAKilometre() {
        Professional professional = withArea(ServiceArea.builder().latitude(-34.912345).longitude(-56.156789).radiusKm(8).build());

        assertEquals(new ServiceAreaResponse(-34.91, -56.16, 8), mapper.toPublicResponse(professional).getServiceArea());
    }

    @Test
    void aProfessionalWithoutAnAreaHasNoneInEitherResponse() {
        assertNull(mapper.toResponse(withArea(null)).getServiceArea());
        assertNull(mapper.toPublicResponse(withArea(null)).getServiceArea());
    }

    @Test
    void registeringKeepsTheChosenArea() {
        ProfessionalCreateRequest request = ProfessionalCreateRequest.builder().name("Beto Gómez")
                .workingLocation("Pocitos").serviceArea(new ServiceAreaRequest(-34.91, -56.15, 12)).build();

        ServiceArea area = mapper.toEntity(request).getServiceArea();

        assertEquals(-34.91, area.getLatitude());
        assertEquals(-56.15, area.getLongitude());
        assertEquals(12, area.getRadiusKm());
    }
}
