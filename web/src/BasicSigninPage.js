// Copyright 2026 The OpenAgent Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React from "react";
import {Button, Card, Form, Input, Result, Spin, message} from "antd";
import {LockOutlined, UserOutlined} from "@ant-design/icons";
import i18next from "i18next";
import * as AccountBackend from "./backend/AccountBackend";
import * as Setting from "./Setting";

class BasicSigninPage extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: true,
      showBasicSignin: false,
      errorMessage: "",
    };
  }

  componentDidMount() {
    AccountBackend.getSigninOptions()
      .then((res) => {
        if (res.status === "ok" && res.data?.casdoorAvailable) {
          window.location.replace(Setting.getSigninUrl());
          return;
        }

        this.setState({
          loading: false,
          showBasicSignin: res.status === "ok" && !res.data?.casdoorAvailable && res.data?.basicSigninEnabled,
          errorMessage: res.status === "ok" ? "" : res.msg,
        });
      })
      .catch((error) => {
        this.setState({
          loading: false,
          showBasicSignin: false,
          errorMessage: error.message,
        });
      });
  }

  onFinish(values) {
    AccountBackend.signinBasic(values.username, values.password)
      .then((res) => {
        if (res.status === "ok") {
          const from = sessionStorage.getItem("from") || "/";
          sessionStorage.removeItem("from");
          window.location.href = from;
        } else {
          message.error(res.msg);
        }
      })
      .catch((error) => message.error(error.message));
  }

  render() {
    if (this.state.loading) {
      return (
        <div style={{display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh"}}>
          <Spin size="large" tip={i18next.t("login:Signing in...")} />
        </div>
      );
    }

    if (!this.state.showBasicSignin) {
      return (
        <Result
          status="warning"
          title={i18next.t("login:Login Error")}
          subTitle={this.state.errorMessage || i18next.t("account:Basic login is disabled")}
        />
      );
    }

    return (
      <div style={{display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f7f7f7"}}>
        <Card title={i18next.t("account:Basic Sign In")} style={{width: 380}}>
          <p style={{marginTop: 0, color: "#666"}}>
            {i18next.t("account:Casdoor is unavailable. Sign in with a local account.")}
          </p>
          <Form onFinish={(values) => this.onFinish(values)}>
            <Form.Item name="username" rules={[{required: true, message: i18next.t("account:Please input your username")}]}>
              <Input prefix={<UserOutlined />} placeholder={i18next.t("general:Username")} autoFocus />
            </Form.Item>
            <Form.Item name="password" rules={[{required: true, message: i18next.t("account:Please input your password")}]}>
              <Input.Password prefix={<LockOutlined />} placeholder={i18next.t("general:Password")} />
            </Form.Item>
            <Button type="primary" htmlType="submit" block>
              {i18next.t("account:Sign In")}
            </Button>
          </Form>
        </Card>
      </div>
    );
  }
}

export default BasicSigninPage;
