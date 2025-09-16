# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.

"""
Tests for Database model methods that interact with DB engine specs.

These tests verify the contract between the Database model and engine specs,
particularly around method calling patterns and signatures.
"""

import pytest

from superset.models.core import Database
from superset.utils.core import QuerySource


@pytest.mark.parametrize(
    "sqlalchemy_uri",
    [
        "snowflake://user:pass@account/db?role=role&warehouse=warehouse",
        "postgresql://localhost/test",
        "trino://localhost:8080/hive/default",
        "databricks://token@workspace/http_path",
        "duckdb:///path/to/db",
    ],
)
def test_database_get_extra_with_multiple_engines(sqlalchemy_uri):
    """
    Test that Database.get_extra() works correctly with all database engine specs.

    This test verifies the normal production call pattern:
    Database.get_extra() -> self.db_engine_spec.get_extra_params(self, source)

    NOTE: This tests the standard flow where db_engine_spec returns a CLASS.
    Both @staticmethod and @classmethod work in this scenario because Python
    calls the method directly on the class. The bug requiring @classmethod
    manifests in dynamic class creation scenarios (see
    test_dynamic_class_method_copying).
    """
    database = Database(database_name="test_db", sqlalchemy_uri=sqlalchemy_uri)

    # This is the actual production call pattern that was broken
    # It should work regardless of which engine spec is used
    extra = database.get_extra(source=QuerySource.SQL_LAB)
    assert isinstance(extra, dict)

    # Also test without source parameter (original behavior)
    extra = database.get_extra()
    assert isinstance(extra, dict)


def test_database_engine_spec_contract():
    """
    Verify the contract between Database model and all engine specs.

    This test ensures that all Database methods that call engine spec methods
    work correctly with the actual method signatures and decorators.

    Tests the integration between layers, not just isolated unit tests.
    Like test_database_get_extra_with_multiple_engines, this tests the normal
    flow where methods are called directly on classes.
    """
    # Test engines that override get_extra_params
    test_engines = [
        ("snowflake://user:pass@account/db", "SnowflakeEngineSpec"),
        ("postgresql://localhost/test", "PostgresEngineSpec"),
        ("trino://localhost:8080/hive", "TrinoEngineSpec"),
        ("databricks://token@workspace", "DatabricksNativeEngineSpec"),
        ("duckdb:///test.db", "DuckDBEngineSpec"),
    ]

    for sqlalchemy_uri, engine_name in test_engines:
        database = Database(
            database_name=f"test_{engine_name.lower()}", sqlalchemy_uri=sqlalchemy_uri
        )

        # Test that the calling pattern matches the method signature
        try:
            # This calls: self.db_engine_spec.get_extra_params(self, source)
            # If get_extra_params is @staticmethod, this will fail with:
            # "takes 2 positional arguments but 3 were given"
            result = database.get_extra(source=QuerySource.SQL_LAB)
            assert isinstance(result, dict), (
                f"{engine_name} should return dict from get_extra_params"
            )

        except TypeError as e:
            if "positional arguments" in str(e):
                pytest.fail(
                    f"{engine_name}.get_extra_params has incompatible signature. "
                    f"Error: {e}. "
                    "This suggests @staticmethod should be @classmethod."
                )
            else:
                raise


def test_regression_snowflake_oauth2_get_extra_params():
    """
    Regression test for Snowflake OAuth2 get_extra_params bug.
    This test reproduces the standard scenario to ensure it works.
    The actual "SnowflakeOAuth2Override" bug is tested in
    test_dynamic_class_method_copying.
    """
    database = Database(
        database_name="snowflake_oauth_test",
        sqlalchemy_uri="snowflake://user:pass@account/db?role=role&warehouse=warehouse",
    )

    # This specific call pattern caused the original error
    # The error occurred when OAuth2 was enabled, creating a dynamic override class
    try:
        extra = database.get_extra(source=QuerySource.SQL_LAB)
        assert isinstance(extra, dict)
        assert "engine_params" in extra
        assert "connect_args" in extra["engine_params"]

    except TypeError as e:
        if "takes 2 positional arguments but 3 were given" in str(e):
            pytest.fail(
                f"Snowflake OAuth2 method signature issue not fixed: {e}. "
                "get_extra_params should use @classmethod, not @staticmethod."
            )
        else:
            raise


def test_dynamic_class_method_copying():
    """
    Test that engine spec methods work when copied to dynamic classes.
    """
    from superset.db_engine_specs.snowflake import SnowflakeEngineSpec

    # Simulate creating a dynamic override class (like SnowflakeOAuth2Override)
    # This is what likely happens in OAuth2 configurations or extensions
    dynamic_override = type(
        "SnowflakeOAuth2Override",
        (),
        {"get_extra_params": SnowflakeEngineSpec.get_extra_params},
    )

    # Create an instance of the dynamic class
    override_instance = dynamic_override()

    # Create a database for testing
    database = Database(
        database_name="test_dynamic_override",
        sqlalchemy_uri="snowflake://user:pass@account/db",
    )

    # Test calling the method through the instance (this is where the bug occurred)
    # With @staticmethod: fails with "takes 2 positional arguments but 3 were given"
    # With @classmethod: works correctly
    try:
        result = override_instance.get_extra_params(database, QuerySource.SQL_LAB)
        assert isinstance(result, dict)
        assert "engine_params" in result
        assert "connect_args" in result["engine_params"]
        assert "application" in result["engine_params"]["connect_args"]
    except TypeError as e:
        if "takes 2 positional arguments but 3 were given" in str(e):
            pytest.fail(
                f"Dynamic class method copying failed: {e}. "
                "This indicates get_extra_params uses @staticmethod when it should "
                "use @classmethod. The bug manifests when methods are copied to "
                "dynamic classes and called through instances."
            )
        else:
            raise


def test_method_reassignment_compatibility():
    """
    Test that engine spec methods can be reassigned and remain compatible.
    """
    from superset.db_engine_specs.snowflake import SnowflakeEngineSpec

    # Test method reassignment (another pattern that can cause issues)
    class CustomEngineSpec:
        pass

    # Assign the method to a different class
    CustomEngineSpec.get_extra_params = SnowflakeEngineSpec.get_extra_params

    database = Database(
        database_name="test_reassignment",
        sqlalchemy_uri="snowflake://user:pass@account/db",
    )

    # Test calling through the reassigned class
    try:
        result = CustomEngineSpec.get_extra_params(database, QuerySource.SQL_LAB)
        assert isinstance(result, dict)
        assert "engine_params" in result
    except TypeError as e:
        if "positional arguments" in str(e):
            pytest.fail(
                f"Method reassignment failed: {e}. "
                "This suggests the method decorator is incompatible with method "
                "reassignment patterns."
            )
        else:
            raise
