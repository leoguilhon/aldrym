import type { CharacterClass, CharacterGender, CreateCharacterRequest } from "@aldrym/shared";
import { characterClasses } from "@aldrym/shared";
import { Transform } from "class-transformer";
import { IsIn, IsString, Length, Matches } from "class-validator";

const allowedCharacterGenders: CharacterGender[] = ["male", "female"];
const allowedCharacterClasses: CharacterClass[] = [...characterClasses];

export class CreateCharacterDto implements CreateCharacterRequest {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value
  )
  @IsString()
  @Length(3, 20)
  @Matches(/^[A-Za-z ]+$/, {
    message: "name must contain only letters and spaces"
  })
  name!: string;

  @IsString()
  @IsIn(allowedCharacterGenders, {
    message: "gender must be either male or female"
  })
  gender!: CharacterGender;

  @IsString()
  @IsIn(allowedCharacterClasses, {
    message: "characterClass must be knight, druid, sorcerer, or hunter"
  })
  characterClass!: CharacterClass;
}
