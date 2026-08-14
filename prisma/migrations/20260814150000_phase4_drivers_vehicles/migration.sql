-- CreateIndex
CREATE UNIQUE INDEX "drivers_phone_key" ON "drivers"("phone");

-- CreateIndex
CREATE INDEX "drivers_status_idx" ON "drivers"("status");

-- CreateIndex
CREATE INDEX "vehicles_status_idx" ON "vehicles"("status");

-- CreateIndex
CREATE INDEX "vehicles_category_status_idx" ON "vehicles"("category", "status");
