import { Exclude, Expose } from 'class-transformer';

/**
 * `@Exclude()` at the class level, `@Expose()` per allowed field — deny-by-default, so a future
 * field added to the `Project` model (or accidentally spread onto this DTO) doesn't leak to the
 * client just because nobody remembered to mark it `@Exclude()` individually. `tenantId` is the
 * one field genuinely withheld here: implementation detail, not something the client needs.
 */
@Exclude()
export class ProjectResponseDto {
  @Expose()
  id!: string;

  @Expose()
  name!: string;

  @Expose()
  createdBy!: string;

  @Expose()
  createdAt!: Date;

  constructor(partial: ProjectResponseDto) {
    Object.assign(this, partial);
  }
}
