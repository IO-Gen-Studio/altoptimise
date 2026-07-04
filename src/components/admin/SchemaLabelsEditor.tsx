import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SCHEMA_FIELDS, useSchemaLabels } from "@/lib/data-store";

export function SchemaLabelsEditor() {
  const { schemaLabels, setSchemaLabel } = useSchemaLabels();

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="text-base font-semibold">Global display names</h2>
          <p className="text-xs text-muted-foreground">
            Rename raw CSV field keys to friendly labels used across every mini-app.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {SCHEMA_FIELDS.map((key) => (
            <div key={key} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                <code className="rounded bg-muted px-1">{key}</code>
              </Label>
              <Input
                value={schemaLabels[key] ?? ""}
                onChange={(e) => setSchemaLabel(key, e.target.value)}
                placeholder={key}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}