package com.um.uy.oficiosya.dto.update;

import com.um.uy.oficiosya.validation.annotations.FullName;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

@Data
@SuperBuilder
@NoArgsConstructor
public class UserUpdateRequest {
    @FullName
    private String name;

    private String profileImageUrl;
}
