import type { DeleteCharacterRequest } from "@aldrym/shared";
import { IsString, MaxLength, MinLength } from "class-validator";

export class DeleteCharacterDto implements DeleteCharacterRequest {
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
