

# Data Engineering Assessment (DEA) Solution

This document serves as the comprehensive final documentation for the technical assessment, covering data modeling, ETL implementation, and best practices.

## 1. Project Overview, Setup, and Execution Instructions

### 1.1 Core Architecture and Dependencies

The solution establishes a modern ELT stack where **MySQL** is the transactional source and **ClickHouse** is the analytical data warehouse. All code is executed within the Dockerized `etl_service`.

| Dependency | Purpose |
| :--- | :--- |
| **`pandas`** | Data transformation and manipulation (in-memory). |
| **`mysql-connector-python`** | Programmatic connection to the MySQL Source. |
| **`clickhouse-driver`** | Programmatic bulk data loading to ClickHouse. |
| **`pymongo`** | Programmatic connection to the MongoDB Source (Conceptual). |
| **`dagster`, `dagster-webserver`** | Orchestration framework (for future integration). |
| **`pytest`** | Unit testing for transformation logic. |

### 1.2 Setup and Running Instructions

The entire environment is containerized. **All services are run once** via Docker Compose.

| Step | Action | Command |
| :--- | :--- | :--- |
| **1. Build & Run Stack** | Builds the ETL service and starts all containers. | `docker compose up --build -d` |
| **2. Execute MySQL DDL & Seed** | Creates Source Schema, Checkpoint Table, and populates initial data. | `type DDL-MySQL-Source.sql | docker exec -i clickhouse-mysql_source-1 mysql -u root -prootpassword ewallet_source` |
| **3. Execute ClickHouse DDL** | Creates the Destination Star Schema and CDC table. | `type DDL-Clickhouse.sql | docker exec -i clickhouse-clickhouse-1 clickhouse-client -u default --password defaultpassword --database=analytics_dw --multiquery` |
| **4. Run CDC Simulation** | Executes the CDC stream simulation code. | `python cdc-stream.py` |
| **5. Run ETL Pipeline (Initial/Incremental)** | Executes the main ELT job inside the Docker container. | *Handled by `docker compose up` in the `etl_service` CMD* |

### 1.3 How to Run ETL for Full vs. Incremental Loads

The core `etl_pipeline.py` script is designed to run the **Incremental Load** by default using a MySQL `checkpoint` table.

| Run Mode | Action Required (Manual Setup via MySQL Client) | Command (MySQL) |
| :--- | :--- | :--- |
| **Full Load** (Run 1) | **Reset the watermark** to force a full data pull. | `UPDATE checkpoint SET last_synced_at = '1970-01-01 00:00:00' WHERE pipeline_name = 'transactions_elt';` |
| **Incremental Load** (Run N) | Load new data, relying on the automatically updated timestamp. | *No manual update needed. Pipeline uses existing `last_synced_at`.* |

***

## 2. Assumptions and Design Choices

### 2.1 Core Assumptions

* **Implementation Focus:** All practical ETL implementation, seeding, and querying is focused on the **MySQL Source**. MongoDB is addressed only conceptually.
* **Orchestration:** The ETL is currently triggered *ad-hoc* via Docker's `CMD` entry point, simulating a job. Full Dagster integration is reserved for the next phase of development.
* **Data Quality:** Only transactions with `status = 'SUCCESS'` are loaded into the analytical `fact_sales` table.

### 2.2 Project Structure and Code Quality (Q5.a)

* **Code Modularity:** Logic is separated into distinct modules (`etl_pipeline.py`, `cdc-stream.py`, `test_etl_logic.py`).
* **Best Practices:** All execution scripts utilize Python's **`logging`** module for structured *traceability* and feature **robust *error handling*** (specific MySQL/ClickHouse exceptions).
* **Dockerization:** The ETL code is packaged into the **`python_etl_pipeline:latest`** Docker image, ensuring portability and consistent dependencies.

---

---

## 2\. Solution for Section 1: Data Modeling & Query Design

### 2.1 ERD Design and Relational Logic

The source schema follows **Third Normal Form (3NF)** for operational integrity.

  * **Entity Relationship Diagram (ERD):**

    \\

  * **Relationship Logic:** All relationships are **One-to-Many Mandatory** from the dimension tables (`USERS`, `MERCHANTS`) to the fact table (`TRANSACTIONS`).

      * **Enforcement:** This is enforced by applying **`NOT NULL`** constraints on the Foreign Key columns in the `transactions` table (MySQL DDL), guaranteeing that every transaction *must* be linked to a registered User and Merchant.

  * **Attribute Choices:**

      * `transaction_id` is **VARCHAR** to support **UUIDs/alphanumeric identifiers** crucial for distributed *fintech* systems.
      * `amount` is **DECIMAL(10, 2)** to maintain **strict financial precision** at the source.

### 2.2 ClickHouse Destination Schema (OLAP)

The destination schema uses a **Star Schema** model, optimized for high-speed analytical queries.

| Feature | MySQL (Source - OLTP) | ClickHouse (Destination - OLAP) |
| :--- | :--- | :--- |
| **Model** | 3NF (Normalized) | **Star Schema** (Denormalized) |
| **Primary Key** | Natural Key (`user_id`, `merchant_id`) | **Surrogate Key** (`user_key`, `merchant_key`) |
| **Optimized Partitioning** | None (Focus on writes) | Uses **`PARTITION BY transaction_date`** to accelerate time-range queries. |

-----

### 2.3 Data Mapping and Transformation Strategy

The process utilizes an **ELT** workflow, mapping and transforming data for analytical efficiency.

  * **Relational Source (MySQL) to ClickHouse:**
    I would transform OLTP MySQL data into ClickHouse OLAP data by using an **Incremental Load** mechanism. Python scripts utilize a **watermark** (e.g., the `created_at` or `updated_at` attribute) to pull only new or updated records. During transformation, I perform **denormalization** by looking up and generating **Surrogate Keys** for the respective dimension tables before loading them into the `fact_sales` table. The `transaction_time` attribute is also split into two in `fact_sales` to become `transaction_time` (`DateTime`) and `transaction_date` (`Date`) to enable faster analytical queries through **data partitioning**.

  * **Non-Relational Source (MongoDB) to ClickHouse (Conceptual):**
    I would extract non-relational data using the **`pymongo` driver**. I use a Python script to convert the JSON structured data into rows and columns (**data flattening**). The converted data is then loaded into a Fact table or Staging area in ClickHouse. The Python script will also include **data validation** and **type casting** in order to ensure data quality and schema compliance before the final load, guaranteeing that the data can be reliably analyzed in ClickHouse.

-----

### 2.4 Querying

The analytical queries provided below are executed against the ClickHouse Star Schema to derive key business metrics. (Queries are provided in `Querying_Total_Transaction_Merchant.sql` and `Querying_Total_Transaction_Merchant.sql` files).

**Query 1: Total Transaction Amount per User per Day**

```sql
SELECT
    t2.name AS user_name,
    t1.transaction_date,
    SUM(t1.amount) AS total_daily_spending
FROM
    analytics_dw.fact_sales t1
LEFT JOIN
    analytics_dw.dim_users t2 ON t1.user_key = t2.user_key
WHERE
    t1.status = 'SUCCESS'
GROUP BY
    user_name,
    t1.transaction_date
ORDER BY
    t1.transaction_date,
    user_name;
```

**Query 2: Total Transactions per Merchant**

```sql
SELECT
    t2.name AS merchant_name,
    t2.category,
    COUNT(t1.transaction_id) AS total_transaction_count
FROM
    analytics_dw.fact_sales t1
LEFT JOIN
    analytics_dw.dim_merchants t2 ON t1.merchant_key = t2.merchant_key
WHERE
    t1.status = 'SUCCESS'
GROUP BY
    merchant_name,
    category
ORDER BY
    total_transaction_count DESC;
```
