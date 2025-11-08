import * as React from "react";
import { IMaskInput } from "react-imask";
import { Input } from "@/components/ui/input"; // Importa o Input do Shadcn

type IMaskInputProps = React.ComponentProps<typeof IMaskInput>;
type BaseInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "onChange" | "value"
>;

export interface MaskedInputProps
  extends BaseInputProps,
    Partial<
      Pick<IMaskInputProps, "mask" | "unmask" | "onAccept" | "onComplete">
    > {
  value?: string;
}

const MaskedInput = React.forwardRef<HTMLInputElement, MaskedInputProps>(
  ({ mask, onAccept, ...props }, ref) => {
    // `IMaskInput` and our design `Input` share many props (className, placeholder, etc.).
    // We construct an `IMaskInput` props object by merging incoming props and the IMask-specific ones.
    // A constrained cast is used once to reconcile the union of prop sets into the IMaskInput prop shape.
    const imaskProps = {
      ...(props as unknown as IMaskInputProps),
      mask,
      onAccept,
      inputRef: ref,
    } as IMaskInputProps;

    return <IMaskInput {...imaskProps} />;
  }
);
MaskedInput.displayName = "MaskedInput";

export { MaskedInput };
